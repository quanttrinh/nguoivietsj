// @boundary server
import { Hono, type Context } from "hono";
import { routePath } from "hono/route";

import { auth } from "~/auth/server/auth";
import { isRecord } from "~/shared/utils/records";

import {
  resolveAuthLocale as resolveLocale,
  sharedMessage,
} from "../helpers/responses/shared-api-error";
import { getTracing, withTracingSpan } from "../helpers/tracing";
import { bodyEmailKey, clientKey, rateLimit } from "../middleware/rate-limit";

export function resolveAuthLocale(request: Request): string {
  return resolveLocale(request);
}

export function authMessage(code: string, locale: string): string {
  return sharedMessage(code, locale);
}

export async function localizeAuthResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (
    response.status < 400 ||
    !(response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false)
  ) {
    return response;
  }

  let body: unknown;

  try {
    body = await response.clone().json();
  } catch {
    return response;
  }

  if (!isRecord(body)) {
    return response;
  }

  if (
    typeof body.error === "string" &&
    typeof body.message === "string" &&
    body.message.length > 0
  ) {
    return response;
  }

  let code: string | null = null;
  if (typeof body.code === "string") {
    code = body.code;
  } else if (typeof body.error === "string") {
    code = body.error;
  } else if (response.status === 429) {
    code = "rate_limited";
  }

  if (code === null) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  const vary = headers.get("vary");
  const localeVary = "Accept-Language, X-Locale";

  headers.set("vary", vary === null ? localeVary : `${vary}, ${localeVary}`);

  return Response.json(
    { ...body, message: authMessage(code, resolveAuthLocale(request)) },
    { status: response.status, statusText: response.statusText, headers },
  );
}

type AuthApiCall = (input: {
  headers: Headers;
  body: Record<string, unknown>;
  asResponse: true;
}) => Promise<Response>;

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function asAuthApiCall(endpoint: unknown): AuthApiCall {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Better Auth's per-endpoint parameter types are stricter than this shared call shape.
  return endpoint as AuthApiCall;
}

async function callWithBody(ctx: Context<HonoEnv>, endpoint: AuthApiCall): Promise<Response> {
  const response = await withTracingSpan({
    tracing: getTracing(ctx),
    name: "auth.endpoint",
    attributes: { "auth.operation": routePath(ctx, -1) || ctx.req.path },
    task: async () =>
      endpoint({
        headers: ctx.req.raw.headers,
        body: await readJsonObject(ctx.req.raw),
        asResponse: true,
      }),
  });

  return localizeAuthResponse(response, ctx.req.raw);
}

export const authRoutes = new Hono<HonoEnv>()
  .post(
    "/email-otp/send-verification-otp",
    rateLimit(
      {
        limiter: (env) => env.AUTH_SEND_OTP_RATE_LIMITER,
        scope: "auth:send-otp",
        label: "send OTP",
        key: (request) => clientKey("auth:send-otp", request),
        onUnavailable: "deny",
      },
      {
        limiter: (env) => env.AUTH_SEND_OTP_RATE_LIMITER,
        scope: "auth:send-otp:email",
        label: "send OTP email",
        key: (request) => bodyEmailKey("auth:send-otp:email", request),
        onUnavailable: "deny",
      },
    ),
    (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.sendVerificationOTP)),
  )
  .post(
    "/sign-in/email-otp",
    rateLimit(
      {
        limiter: (env) => env.AUTH_VERIFY_OTP_RATE_LIMITER,
        scope: "auth:verify-otp",
        label: "verify OTP",
        key: (request) => clientKey("auth:verify-otp", request),
        onUnavailable: "deny",
      },
      {
        limiter: (env) => env.AUTH_VERIFY_OTP_RATE_LIMITER,
        scope: "auth:verify-otp:account",
        label: "verify OTP account",
        key: (request) => bodyEmailKey("auth:verify-otp:account", request),
        onUnavailable: "deny",
      },
    ),
    (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.signInEmailOTP)),
  )
  .post("/sign-out", (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.signOut)))
  .get("/get-session", (ctx) =>
    withTracingSpan({
      tracing: getTracing(ctx),
      name: "auth.endpoint",
      attributes: { "auth.operation": routePath(ctx, -1) || ctx.req.path },
      task: () =>
        auth(ctx.env).api.getSession({
          headers: ctx.req.raw.headers,
          asResponse: true,
        }),
    }),
  );
