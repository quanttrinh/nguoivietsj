// @boundary server
import { sValidator } from "@hono/standard-validator";
import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import {
  STATUS_OTP_TOKEN_TTL_SECONDS,
  STATUS_OTP_TTL_SECONDS,
} from "~/features/events/domain/status";
import { statusViewPath } from "~/features/events/domain/status-paths";
import { normalizeEmail } from "~/features/events/server/normalize";
import {
  statusRequestBodySchema,
  statusVerifyBodySchema,
} from "~/features/events/server/schemas/status";
import { createCheckinQrSvg } from "~/features/events/server/services/checkin-qr";
import { enqueueStatusOtpEmail } from "~/features/events/server/services/email-queue";
import { loadRegistrationView } from "~/features/events/server/services/registration-view";
import {
  hashStatusToken,
  issueStatusOtp,
  verifyStatusOtp,
} from "~/features/events/server/services/status";
import { apiSuccess } from "~/platform/server/api/helpers/responses/api-response";
import { notFound, rateLimited } from "~/platform/server/api/helpers/responses/common-responses";
import { defaultValidationHandler } from "~/platform/server/api/helpers/validation/validation-handler";
import { getRegistrationStatusRepository } from "~/platform/server/db/events";
import { serverLogger } from "~/platform/server/logger";
import { apiBodyLimit } from "~/platform/server/middleware/body-limit";
import {
  checkRateLimit,
  clientIdKey,
  clientKey,
  emailKey,
  rateLimit,
  type RateLimitSettings,
} from "~/platform/server/middleware/rate-limit";

import { eventApiError } from "./event-errors";

const STATUS_SESSION_COOKIE = "status_session";

/** Browsers (and Hono's serializer) cap cookie lifetimes at 400 days. */
const MAX_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Keep the session token out of URLs and JavaScript-visible storage. */
function statusSessionCookieOptions(
  ctx: Parameters<typeof setCookie>[0],
  maxAge: number = STATUS_OTP_TOKEN_TTL_SECONDS,
) {
  return {
    httpOnly: true,
    sameSite: "Lax",
    path: "/api/events/status",
    maxAge: Math.min(MAX_COOKIE_MAX_AGE_SECONDS, Math.max(0, Math.floor(maxAge))),
    secure: new URL(ctx.req.url).protocol === "https:",
  } as const;
}

const statusOtpIpRateLimit = {
  limiter: (env) => env.EVENT_ENGINE_STATUS_RATE_LIMITER,
  scope: "status-otp",
  key: (request) => clientKey("status-otp", request),
  label: "Status OTP rate limiter",
} satisfies RateLimitSettings;

const MAX_STATUS_BODY_BYTES = 2 * 1024;

function statusOtpEmailRateLimit(email: string): RateLimitSettings {
  return {
    limiter: (env) => env.EVENT_ENGINE_STATUS_RATE_LIMITER,
    scope: "status-otp-email",
    key: () => emailKey("status-otp-email", email),
    label: "Status OTP email rate limiter",
  };
}

function statusVerifyRateLimit(registrationId: string): RateLimitSettings {
  return {
    limiter: (env) => env.EVENT_ENGINE_STATUS_RATE_LIMITER,
    scope: "status-verify",
    key: (request) => clientIdKey("status-verify", request, registrationId),
    label: "Status OTP verify rate limiter",
  };
}

function codeSent(ctx: Context) {
  return apiSuccess(ctx, { notice: "event_code_sent" });
}

function codeError(ctx: Context, error: "event_code_invalid" | "event_code_locked") {
  return eventApiError(ctx, error, { status: 400 });
}

/** Issue and queue a status OTP when the registration and email match. */
async function deliverStatusOtp(
  env: Env,
  request: Request,
  input: { registrationId: string; email: string },
) {
  const repository = getRegistrationStatusRepository(env.EVENT_ENGINE_DB);

  try {
    const registration = await repository.findRegistrationEmail(input.registrationId);

    if (
      registration === null ||
      normalizeEmail(registration.email) !== normalizeEmail(input.email)
    ) {
      return;
    }

    const emailLimit = await checkRateLimit(
      request,
      env,
      statusOtpEmailRateLimit(registration.email),
    );

    if (!emailLimit.allowed) {
      return;
    }

    const otpResult = await issueStatusOtp(repository, input.registrationId);

    if (!otpResult.ok) {
      return;
    }

    const { otp } = otpResult;

    if (import.meta.env.DEV) {
      serverLogger.info("Development status OTP", {
        registrationId: input.registrationId,
        code: otp.code,
      });
    }

    const queued = await enqueueStatusOtpEmail(env, {
      email: registration.email,
      code: otp.code,
      registrationId: input.registrationId,
      otpId: otp.id,
      expiresMinutes: Math.floor(STATUS_OTP_TTL_SECONDS / 60),
    });

    if (!queued && !import.meta.env.DEV) {
      serverLogger.error(
        { registrationId: input.registrationId },
        "Status OTP email was not queued",
      );
    }
  } catch (error: unknown) {
    serverLogger.error({ error }, "Failed to issue status OTP");
  }
}

export const eventStatus = new Hono<HonoEnv>()
  .post(
    "/request",
    rateLimit(statusOtpIpRateLimit),
    apiBodyLimit(MAX_STATUS_BODY_BYTES),
    sValidator("json", statusRequestBodySchema, defaultValidationHandler),
    (ctx) => {
      // Respond before any lookup. Issuing the OTP adds D1 writes and a queue
      // send only for matching registrations, which would otherwise be an
      // email-enumeration timing oracle.
      ctx.executionCtx.waitUntil(deliverStatusOtp(ctx.env, ctx.req.raw, ctx.req.valid("json")));

      return codeSent(ctx);
    },
  )
  .post(
    "/verify",
    apiBodyLimit(MAX_STATUS_BODY_BYTES),
    sValidator("json", statusVerifyBodySchema, defaultValidationHandler),
    async (ctx) => {
      const { registrationId, code } = ctx.req.valid("json");

      const verifyLimited = await checkRateLimit(
        ctx.req.raw,
        ctx.env,
        statusVerifyRateLimit(registrationId),
      );

      if (!verifyLimited.allowed) {
        return rateLimited(ctx, verifyLimited.retryAfterSeconds);
      }

      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const verification = await verifyStatusOtp(
        getRegistrationStatusRepository(engineDb),
        registrationId,
        code,
      );

      if (!verification.ok) {
        return codeError(
          ctx,
          verification.reason === "locked" ? "event_code_locked" : "event_code_invalid",
        );
      }

      setCookie(
        ctx,
        STATUS_SESSION_COOKIE,
        verification.token.token,
        statusSessionCookieOptions(ctx),
      );

      return apiSuccess(ctx, { ok: true });
    },
  )
  .get("/link", async (ctx) => {
    // The emailed magic link lands here so the token never appears in the
    // rendered page URL or the browser history. Invalid links still reach the
    // view page, which shows its own invalid-link state.
    const token = ctx.req.query("token");
    const destination = statusViewPath(ctx.req.query("locale"));

    if (token !== undefined && token.length > 0) {
      const access = await getRegistrationStatusRepository(ctx.env.EVENT_ENGINE_DB).findByTokenHash(
        await hashStatusToken(token),
        new Date().toISOString(),
      );

      if (access !== null) {
        // Emailed registration links live far longer than an OTP session, so
        // scope the cookie to the token's own remaining lifetime.
        const remainingSeconds = (new Date(access.expiresAt).getTime() - Date.now()) / 1000;
        setCookie(
          ctx,
          STATUS_SESSION_COOKIE,
          token,
          statusSessionCookieOptions(ctx, remainingSeconds),
        );
      }
    }

    return ctx.redirect(destination, 302);
  })
  .get("/", async (ctx) => {
    // Read the HttpOnly session cookie first. The header remains as a fallback
    // for API clients and tests that cannot carry browser cookies.
    const token = getCookie(ctx, STATUS_SESSION_COOKIE) ?? ctx.req.header("x-status-token");

    if (token === undefined || token.length === 0) {
      return notFound(ctx);
    }

    const engineDb = ctx.env.EVENT_ENGINE_DB;
    const access = await getRegistrationStatusRepository(engineDb).findByTokenHash(
      await hashStatusToken(token),
      new Date().toISOString(),
    );

    if (access === null) {
      return notFound(ctx);
    }

    const lookup = await loadRegistrationView({
      db: engineDb,
      eventId: access.eventId,
      registrationId: access.registrationId,
    });

    if (!lookup.ok) {
      return notFound(ctx);
    }

    const { event, registration, payment, checkin, answerFields, amountDue, currency, paid } =
      lookup.view;

    return apiSuccess(
      ctx,
      {
        event: {
          id: event.id,
          slug: event.slug,
          defaultLocale: event.defaultLocale,
          timezone: event.timezone,
          title: event.title,
          payments: event.payments,
          limits: event.limits,
        },
        registration,
        payment,
        checkin,
        answerFields,
        amountDue,
        currency,
        paid,
        qrSvg: paid ? createCheckinQrSvg(registration.id) : null,
      },
      { headers: { "x-content-type-options": "nosniff" } },
    );
  });
