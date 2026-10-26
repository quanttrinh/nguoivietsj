// @boundary server
/* oxlint-disable typescript/explicit-function-return-type -- response types stay inferred for Hono RPC. */
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";

import {
  getCheckinRepository,
  getEventRepository,
  getPaymentRepository,
  getRegistrationRepository,
  getRegistrationStatusRepository,
} from "~/db/events";
import { isRegistrationPaid } from "~/events/domain/payment";
import { registrationAmountDue } from "~/events/domain/presentation";
import {
  statusRequestBodySchema,
  statusTokenParamSchema,
  statusVerifyBodySchema,
} from "~/events/domain/schemas/status";
import { STATUS_OTP_TTL_SECONDS } from "~/events/domain/status";
import { createCheckinQrSvg } from "~/events/services/checkin-qr";
import { enqueueStatusOtpEmail } from "~/events/services/email-queue";
import { hashStatusToken, issueStatusOtp, verifyStatusOtp } from "~/events/services/status";
import { apiError, apiSuccess } from "~/server/api-response";
import { notFound, rateLimited } from "~/server/common-responses";
import {
  checkRateLimit,
  clientIdKey,
  clientKey,
  emailKey,
  rateLimit,
  type RateLimitSettings,
} from "~/server/middleware/rate-limit";
import { defaultValidationHandler } from "~/server/validation-handler";
import { serverLogger } from "~/shared/server/logger";

const statusOtpIpRateLimit = {
  limiter: (env) => env.EVENT_ENGINE_STATUS_RATE_LIMITER,
  scope: "status-otp",
  key: (request) => clientKey("status-otp", request),
  label: "Status OTP rate limiter",
} satisfies RateLimitSettings;

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

function codeSent(ctx: Parameters<typeof notFound>[0]) {
  return apiSuccess(ctx, { notice: "event_code_sent" });
}

function codeError(
  ctx: Parameters<typeof notFound>[0],
  error: "event_code_invalid" | "event_code_locked",
) {
  return apiError(ctx, error, { status: 400 });
}

export const eventStatus = new Hono<HonoEnv>()
  .post(
    "/request",
    sValidator("json", statusRequestBodySchema, defaultValidationHandler),
    rateLimit(statusOtpIpRateLimit),
    async (ctx) => {
      const body = ctx.req.valid("json");
      const email = body.email.trim().toLowerCase();

      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const registration = await getRegistrationStatusRepository(engineDb).findRegistrationEmail(
        body.registrationId,
      );

      if (registration === null || registration.email.toLowerCase() !== email) {
        return codeSent(ctx);
      }

      const emailLimited = await checkRateLimit(
        ctx.req.raw,
        ctx.env,
        statusOtpEmailRateLimit(registration.email),
      );

      if (!emailLimited.allowed) {
        return codeSent(ctx);
      }

      const otpResult = await issueStatusOtp(
        getRegistrationStatusRepository(engineDb),
        body.registrationId,
      );

      if (!otpResult.ok) {
        return codeSent(ctx);
      }

      const otp = otpResult.otp;

      if (import.meta.env.DEV) {
        serverLogger.info("Development status OTP", {
          registrationId: body.registrationId,
          code: otp.code,
        });
      }

      const queued = await enqueueStatusOtpEmail(ctx.env, {
        email: registration.email,
        code: otp.code,
        registrationId: body.registrationId,
        otpId: otp.id,
        expiresMinutes: Math.floor(STATUS_OTP_TTL_SECONDS / 60),
      });

      if (!queued && !import.meta.env.DEV) {
        serverLogger.error(
          { registrationId: body.registrationId },
          "Status OTP email was not queued",
        );
      }

      return codeSent(ctx);
    },
  )
  .post(
    "/verify",
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

      return apiSuccess(ctx, { token: verification.token.token });
    },
  )
  .get(
    "/:token",
    sValidator("param", statusTokenParamSchema, defaultValidationHandler),
    async (ctx) => {
      const { token } = ctx.req.valid("param");

      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const access = await getRegistrationStatusRepository(engineDb).consumeByTokenHash(
        await hashStatusToken(token),
        new Date().toISOString(),
      );

      if (access === null) {
        return notFound(ctx);
      }

      const [event, registration] = await Promise.all([
        getEventRepository(engineDb).findWithLimits(access.eventId),
        getRegistrationRepository(engineDb).findById(access.eventId, access.registrationId),
      ]);

      if (event === null || registration === null) {
        return notFound(ctx);
      }

      const [payment, checkin] = await Promise.all([
        getPaymentRepository(engineDb).findByRegistrationId(registration.id),
        getCheckinRepository(engineDb).findByRegistration(event.id, registration.id),
      ]);
      const amountDue = registrationAmountDue(registration);
      const paid = isRegistrationPaid(payment, amountDue);

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
          amountDue,
          currency: registration.tickets[0]?.currency ?? event.limits.currency,
          paid,
          qrSvg: paid ? createCheckinQrSvg(registration.id) : null,
        },
        { headers: { "x-content-type-options": "nosniff" } },
      );
    },
  );
