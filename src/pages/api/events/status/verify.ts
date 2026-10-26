import { Type } from "@sinclair/typebox";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { Effect, Result } from "effect";

import { createEngineDb } from "~/db/events";
import { SCHEMA_FORMAT } from "~/events/domain/schema-formats";
import { json } from "~/events/server/http";
import { verifyStatusOtp } from "~/events/server/status";
import { STATUS_OTP_CODE_LENGTH } from "~/shared/constants/limits";
import { statusOtpCodeRegex } from "~/shared/constants/patterns";
import { withSameOriginRoute, withValidatedBody } from "~/shared/server/api/route-decorators";

export const prerender = false;

const verifySchema = Type.Object({
  registrationId: Type.String({ format: SCHEMA_FORMAT.uuidV7, maxLength: 36 }),
  code: Type.String({ maxLength: 32 }),
});

export const POST: APIRoute = withSameOriginRoute(
  withValidatedBody(verifySchema, async (_context, body) => {
    const code = body.code.trim();

    if (!statusOtpCodeRegex(STATUS_OTP_CODE_LENGTH).test(code)) {
      return json({ error: "code_invalid" }, 200);
    }

    const db = createEngineDb(env.EVENT_ENGINE_DB);
    const verificationEffect = verifyStatusOtp(db.registrationStatus, body.registrationId, code);
    const verification = await Effect.runPromise(Effect.result(verificationEffect));

    if (Result.isFailure(verification)) {
      return json(
        { error: verification.failure.reason === "locked" ? "code_locked" : "code_invalid" },
        200,
      );
    }

    return json({ token: verification.success.token }, 200);
  }),
);
