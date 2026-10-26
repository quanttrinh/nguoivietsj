import { env } from "cloudflare:workers";

import { MAX_TURNSTILE_TOKEN_LENGTH } from "~/shared/constants/limits";
import { TURNSTILE_TEST_SECRET } from "~/shared/server/turnstile/constants";

const LOCAL_HOSTS = new Set(["0.0.0.0", "127.0.0.1", "[::1]", "localhost"]);

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

function jsonError(error: string, status: number): Response {
  return Response.json(
    { error },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

function isLocalhost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

function resolveSecret(): string | null {
  const configured = (env.TURNSTILE_SECRET ?? "").trim();

  if (configured.length > 0) {
    return configured;
  }

  return import.meta.env.DEV ? TURNSTILE_TEST_SECRET : null;
}

function resolveVerifyUrl(): string {
  const configured = (env.TURNSTILE_VERIFY_URL ?? "").trim();

  if (configured.length > 0) {
    return configured;
  }

  const scriptUrl = (env.TURNSTILE_SCRIPT_URL ?? "").trim();

  if (scriptUrl.length === 0) {
    return "";
  }

  try {
    return new URL("/turnstile/v0/siteverify", scriptUrl).toString();
  } catch {
    return "";
  }
}

/**
 * Verify a Turnstile token before any expensive or side-effecting work.
 *
 * Returns `null` when the request may continue, otherwise a ready-to-return
 * error response. Siteverify failures fail closed with `503`; invalid or
 * replayed tokens return `400`.
 */
export async function verifyTurnstile(
  request: Request,
  token: unknown,
  expectedAction: string,
): Promise<Response | null> {
  const secret = resolveSecret();
  const verifyUrl = resolveVerifyUrl();

  if (secret === null || verifyUrl.length === 0) {
    console.error("Turnstile secret or verification URL is not configured");
    return jsonError("turnstile_unavailable", 503);
  }

  const requestUrl = new URL(request.url);
  const hostname = requestUrl.hostname;
  const hostHeader = request.headers.get("host") ?? hostname;
  const requestHost = hostHeader.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]"))
    : (hostHeader.split(":", 1)[0] ?? hostname);
  const testMode = secret === TURNSTILE_TEST_SECRET;

  const allowTestKey =
    (env.TURNSTILE_ALLOW_TEST_KEY as string | undefined) === "true" &&
    requestUrl.protocol !== "https:";

  if (
    testMode &&
    !import.meta.env.DEV &&
    !allowTestKey &&
    !isLocalhost(hostname) &&
    !isLocalhost(requestHost)
  ) {
    console.error("TURNSTILE_SECRET is using the public test key on a non-local host");
    return jsonError("turnstile_unavailable", 503);
  }

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TURNSTILE_TOKEN_LENGTH
  ) {
    return jsonError("turnstile_required", 400);
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);

  const remoteIp = request.headers.get("cf-connecting-ip");

  if (remoteIp !== null && remoteIp.length > 0) {
    form.append("remoteip", remoteIp);
  }

  const response = await fetch(verifyUrl, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(5000),
  }).catch((error: unknown) => {
    console.error("Turnstile Siteverify request failed", error);
    return null;
  });

  if (response === null) {
    return jsonError("turnstile_unavailable", 503);
  }

  if (!response.ok) {
    console.error(`Turnstile Siteverify returned status ${response.status}`);
    return jsonError("turnstile_unavailable", 503);
  }

  const result = (await response.json().catch((error: unknown) => {
    console.error("Turnstile Siteverify returned invalid JSON", error);
    return null;
  })) as SiteverifyResponse | null;

  if (result === null) {
    return jsonError("turnstile_unavailable", 503);
  }

  if (result.success !== true) {
    console.warn("Turnstile challenge rejected", result["error-codes"] ?? []);
    return jsonError("turnstile_failed", 400);
  }

  if (!testMode && (result.action !== expectedAction || result.hostname !== hostname)) {
    console.warn("Turnstile action or hostname mismatch", {
      action: result.action,
      hostname: result.hostname,
    });
    return jsonError("turnstile_failed", 400);
  }

  return null;
}
