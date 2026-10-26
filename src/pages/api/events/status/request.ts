import { Type } from "@sinclair/typebox";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { Effect, Result } from "effect";

import { createEngineDb } from "~/db/events";
import { SCHEMA_FORMAT } from "~/events/domain/schema-formats";
import { enqueueStatusOtpEmail } from "~/events/server/email-queue";
import { json } from "~/events/server/http";
import { allowStatusOtpRequest } from "~/events/server/rate-limit";
import { issueStatusOtp, STATUS_OTP_TTL_SECONDS } from "~/events/server/status";
import { withSameOriginRoute, withValidatedBody } from "~/shared/server/api/route-decorators";

export const prerender = false;

const requestSchema = Type.Object({
  registrationId: Type.String({ format: SCHEMA_FORMAT.uuidV7, maxLength: 36 }),
  email: Type.String({ format: SCHEMA_FORMAT.email, maxLength: 320 }),
});

export const POST: APIRoute = withSameOriginRoute(
  withValidatedBody(
    requestSchema,
    async (_context, body) => {
      const db = createEngineDb(env.EVENT_ENGINE_DB);
      const registrationId = body.registrationId;
      const email = body.email.trim().toLowerCase();
      const registration = await db.registrationStatus.findRegistrationEmail(registrationId);

      if (registration === null || registration.email.toLowerCase() !== email) {
        return json({ notice: "code_sent" }, 200);
      }

      const otpEffect = issueStatusOtp(db.registrationStatus, registrationId);
      const otpResult = await Effect.runPromise(Effect.result(otpEffect));

      if (Result.isFailure(otpResult)) {
        return json({ error: "rate_limited" }, 200);
      }

      const otp = otpResult.success;

      if (import.meta.env.DEV) {
        console.info("Development status OTP", { registrationId, code: otp.code });
      }

      const queued = await enqueueStatusOtpEmail(env, {
        email: registration.email,
        code: otp.code,
        registrationId,
        expiresMinutes: Math.floor(STATUS_OTP_TTL_SECONDS / 60),
      });

      if (!queued && !import.meta.env.DEV) {
        return json({ error: "code_unavailable" }, 200);
      }

      return json({ notice: "code_sent", registrationId }, 200);
    },
    async ({ request }) =>
      (await allowStatusOtpRequest(request)) ? null : json({ error: "rate_limited" }, 200),
  ),
);
