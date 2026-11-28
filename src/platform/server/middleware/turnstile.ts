// @boundary server
import { type } from "arktype";
import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

import { internalServerError } from "~/platform/server/api/helpers/responses/common-responses";
import { sharedApiError } from "~/platform/server/api/helpers/responses/shared-api-error";
import { serverLogger } from "~/platform/server/logger";
import { coalesceString } from "~/platform/utils/string";

const turnstileTokenSchema = type("0 < string <= 2048");

const siteverifyResponseSchema = type({
  success: "boolean",
  "challenge_ts?": "string",
  "hostname?": "string",
  "error-codes?": "string[]",
  "action?": "string",
  "cdata?": "string",
});
type SiteverifyResponse = typeof siteverifyResponseSchema.infer;

interface SiteverifyRequest {
  secret: string;
  response: string;
  remoteip?: string;
  idempotency_key?: string;
}

function resolveSecret(ctx: Context<HonoEnv>) {
  const configured = coalesceString(ctx.env.TURNSTILE_SECRET);
  return configured.length > 0 ? configured : null;
}

async function verifyTurnstile(
  ctx: Context<HonoEnv>,
  request: SiteverifyRequest,
): Promise<SiteverifyResponse> {
  const response = await fetch(coalesceString(ctx.env.TURNSTILE_SITEVERIFY_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Turnstile siteverify request failed with status ${response.status}`);
  }

  const json: unknown = await response.json();

  return siteverifyResponseSchema.assert(json);
}

function challengeRequired(ctx: Context<HonoEnv>): Response {
  return sharedApiError(ctx, "turnstile_required", { status: 403 });
}

export function requireTurnstile(expectedAction?: string): MiddlewareHandler<HonoEnv> {
  return createMiddleware<HonoEnv>(async (ctx, next) => {
    const token = turnstileTokenSchema(ctx.req.header("X-Turnstile-Token"));

    if (token instanceof type.errors) {
      return challengeRequired(ctx);
    }

    const secret = resolveSecret(ctx);

    if (secret == null) {
      serverLogger.error("Turnstile secret is not configured");
      return internalServerError(ctx);
    }

    let result: Awaited<ReturnType<typeof verifyTurnstile>>;

    try {
      const remoteip = ctx.req.header("CF-Connecting-IP");
      result = await verifyTurnstile(ctx, {
        secret,
        response: token,
        ...(remoteip ? { remoteip } : {}),
      });
    } catch (error) {
      serverLogger.error(error);
      return sharedApiError(ctx, "turnstile_verification_failed", { status: 500 });
    }

    if (!result.success) {
      return challengeRequired(ctx);
    }

    // Cloudflare test keys return no matching action or hostname, so skip
    // those checks only for local dev and preview builds.
    const allowTestKey = import.meta.env.DEV || import.meta.env.MODE === "preview";
    if (expectedAction !== undefined && !allowTestKey && result.action !== expectedAction) {
      return sharedApiError(ctx, "turnstile_failed", { status: 403 });
    }

    // A token solved for this widget on another hostname must not be reusable
    // here. Cloudflare always returns the hostname on successful verification.
    const requestHostname = URL.parse(ctx.req.url)?.hostname ?? null;
    if (!allowTestKey && (requestHostname === null || result.hostname !== requestHostname)) {
      return sharedApiError(ctx, "turnstile_failed", { status: 403 });
    }

    return next();
  });
}
