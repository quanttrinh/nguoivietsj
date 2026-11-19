// @boundary server
import { Hono } from "hono";

import { BETTER_AUTH_BASE_PATH } from "~/auth/constants";
import { auth } from "~/auth/server/auth";

import { bodyEmailKey, clientKey, rateLimit } from "./middleware/rate-limit";
import { adminUsers } from "./routes/admin-users";
import { adminEvents } from "./routes/events/admin";
import { publicEvents } from "./routes/events/public";
import { eventStatus } from "./routes/events/status";
import { health } from "./routes/health";

export const root = new Hono<HonoEnv>()
  .route("/api/health", health)
  .post(
    `${BETTER_AUTH_BASE_PATH}/sign-in/email`,
    rateLimit(
      {
        limiter: (env) => env.AUTH_SIGN_IN_RATE_LIMITER,
        scope: "auth:sign-in",
        label: "sign in",
        key: (request) => clientKey("auth:sign-in", request),
      },
      {
        limiter: (env) => env.AUTH_SIGN_IN_RATE_LIMITER,
        scope: "auth:sign-in:email",
        label: "sign in email",
        key: (request) => bodyEmailKey("auth:sign-in:email", request),
      },
    ),
    (ctx) => auth(ctx.env).handler(ctx.req.raw),
  )
  .post(
    `${BETTER_AUTH_BASE_PATH}/two-factor/send-otp`,
    rateLimit(
      {
        limiter: (env) => env.AUTH_SEND_OTP_RATE_LIMITER,
        scope: "auth:send-otp",
        label: "send OTP",
        key: (request) => clientKey("auth:send-otp", request),
      },
      {
        limiter: (env) => env.AUTH_SEND_OTP_RATE_LIMITER,
        scope: "auth:send-otp:email",
        label: "send OTP email",
        key: (request) => bodyEmailKey("auth:send-otp:email", request),
      },
    ),
    (ctx) => auth(ctx.env).handler(ctx.req.raw),
  )
  .post(
    `${BETTER_AUTH_BASE_PATH}/two-factor/verify-otp`,
    rateLimit({
      limiter: (env) => env.AUTH_VERIFY_OTP_RATE_LIMITER,
      scope: "auth:verify-otp",
      label: "verify OTP",
      key: (request) => clientKey("auth:verify-otp", request),
      onUnavailable: "deny",
    }),
    (ctx) => auth(ctx.env).handler(ctx.req.raw),
  )
  .post(
    `${BETTER_AUTH_BASE_PATH}/two-factor/verify-backup-code`,
    rateLimit({
      limiter: (env) => env.AUTH_VERIFY_OTP_RATE_LIMITER,
      scope: "auth:verify-backup-code",
      label: "verify backup code",
      key: (request) => clientKey("auth:verify-backup-code", request),
      onUnavailable: "deny",
    }),
    (ctx) => auth(ctx.env).handler(ctx.req.raw),
  )
  .on(["GET", "POST"], `${BETTER_AUTH_BASE_PATH}/*`, (ctx) => auth(ctx.env).handler(ctx.req.raw))
  .route("/api/admin/users", adminUsers)
  .route("/api/admin/events", adminEvents)
  .route("/api/events/status", eventStatus)
  .route("/api/events", publicEvents);

export type AppType = typeof root;
