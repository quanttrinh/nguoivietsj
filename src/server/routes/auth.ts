// @boundary server
import { Hono, type Context } from "hono";
import { routePath } from "hono/route";

import { auth } from "~/auth/server/auth";
import { accountKey } from "~/auth/server/rate-limit-keys";
import { isRecord } from "~/shared/utils/records";

import { bodyEmailKey, clientKey, rateLimit } from "../middleware/rate-limit";
import { getTracing, withTracingSpan } from "../tracing";

/** The subset of Better Auth's endpoint input this app forwards. */
type AuthApiCall = (input: {
  headers: Headers;
  body: Record<string, unknown>;
  asResponse: true;
}) => Promise<Response>;

/**
 * Read a JSON object from the request body.
 *
 * Unlisted or malformed bodies become `{}` so Better Auth's own validation
 * produces the response instead of the router throwing.
 */
async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Narrow a Better Auth endpoint to the call shape used by these explicit
 * routes. Each plugin generates its own strict parameter type, but every
 * cookie-setting endpoint accepts the same `{ headers, body, asResponse }`.
 */
function asAuthApiCall(endpoint: unknown): AuthApiCall {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Better Auth's per-endpoint parameter types are stricter than this shared call shape.
  return endpoint as AuthApiCall;
}

async function callWithBody(ctx: Context<HonoEnv>, endpoint: AuthApiCall): Promise<Response> {
  return withTracingSpan({
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
}

/**
 * Only the Better Auth operations this app uses are mounted. Unknown
 * `/api/auth/*` paths fall through to the app's API 404 handler instead of
 * reaching Better Auth's raw router (which would expose every plugin endpoint).
 */
export const authRoutes = new Hono<HonoEnv>()
  .post(
    "/sign-in/email",
    rateLimit(
      {
        limiter: (env) => env.AUTH_SIGN_IN_RATE_LIMITER,
        scope: "auth:sign-in",
        label: "sign in",
        key: (request) => clientKey("auth:sign-in", request),
        onUnavailable: "deny",
      },
      {
        limiter: (env) => env.AUTH_SIGN_IN_RATE_LIMITER,
        scope: "auth:sign-in:email",
        label: "sign in email",
        key: (request) => bodyEmailKey("auth:sign-in:email", request),
        onUnavailable: "deny",
      },
    ),
    (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.signInEmail)),
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
  )
  .post(
    "/two-factor/send-otp",
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
        scope: "auth:send-otp:account",
        label: "send OTP account",
        key: (request) => accountKey("auth:send-otp:account", request),
        onUnavailable: "deny",
      },
    ),
    (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.sendTwoFactorOTP)),
  )
  .post(
    "/two-factor/verify-otp",
    rateLimit({
      limiter: (env) => env.AUTH_VERIFY_OTP_RATE_LIMITER,
      scope: "auth:verify-otp",
      label: "verify OTP",
      key: (request) => clientKey("auth:verify-otp", request),
      onUnavailable: "deny",
    }),
    (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.verifyTwoFactorOTP)),
  )
  .post(
    "/two-factor/verify-totp",
    rateLimit(
      {
        limiter: (env) => env.AUTH_VERIFY_OTP_RATE_LIMITER,
        scope: "auth:verify-totp",
        label: "verify TOTP",
        key: (request) => clientKey("auth:verify-totp", request),
        onUnavailable: "deny",
      },
      {
        limiter: (env) => env.AUTH_VERIFY_OTP_RATE_LIMITER,
        scope: "auth:verify-totp:account",
        label: "verify TOTP account",
        key: (request) => accountKey("auth:verify-totp:account", request),
        onUnavailable: "deny",
      },
    ),
    (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.verifyTOTP)),
  )
  .post(
    "/two-factor/verify-backup-code",
    rateLimit({
      limiter: (env) => env.AUTH_VERIFY_OTP_RATE_LIMITER,
      scope: "auth:verify-backup-code",
      label: "verify backup code",
      key: (request) => clientKey("auth:verify-backup-code", request),
      onUnavailable: "deny",
    }),
    (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.verifyBackupCode)),
  )
  .post(
    "/two-factor/enable",
    // Enrollment re-checks the account password, so throttle it like sign-in.
    rateLimit(
      {
        limiter: (env) => env.AUTH_SIGN_IN_RATE_LIMITER,
        scope: "auth:two-factor-enable",
        label: "enable two-factor",
        key: (request) => clientKey("auth:two-factor-enable", request),
        onUnavailable: "deny",
      },
      {
        limiter: (env) => env.AUTH_SIGN_IN_RATE_LIMITER,
        scope: "auth:two-factor-enable:account",
        label: "enable two-factor account",
        key: (request) => accountKey("auth:two-factor-enable:account", request),
        onUnavailable: "deny",
      },
    ),
    (ctx) => callWithBody(ctx, asAuthApiCall(auth(ctx.env).api.enableTwoFactor)),
  );
