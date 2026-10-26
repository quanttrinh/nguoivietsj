import { Type } from "@sinclair/typebox";
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { Effect } from "effect";

import { createEngineDb } from "~/db/events";
import { PAYMENT_METHOD } from "~/events/domain/constants";
import { statusPageUrl } from "~/events/server/email";
import { enqueuePaymentConfirmedEmail } from "~/events/server/email-queue";
import { json } from "~/events/server/http";
import { issueStatusToken } from "~/events/server/status";
import { apiFailure, runApiEffect } from "~/shared/server/api/effect";
import { eventIdFromParams, registrationIdFromParams } from "~/shared/server/api/params";
import { API_PROBLEM } from "~/shared/server/api/problems";
import { forbidden, invalidEventId, invalidRegistrationId } from "~/shared/server/api/responses";
import { withStaffRoute, withValidatedBody } from "~/shared/server/api/route-decorators";

export const prerender = false;

const nullableNote = Type.Union([Type.String({ maxLength: 500 }), Type.Null()]);

const paymentSchema = Type.Object(
  {
    method: Type.Union([Type.Literal(PAYMENT_METHOD.cash), Type.Literal(PAYMENT_METHOD.etransfer)]),
    amountMinor: Type.Optional(Type.Integer({ minimum: 0, maximum: 100_000_000 })),
    note: Type.Optional(nullableNote),
  },
  { additionalProperties: false },
);

export const POST: APIRoute = withStaffRoute(
  withValidatedBody(paymentSchema, ({ locals, params, request }, body) => {
    const program = Effect.gen(function* recordPaymentProgram() {
      const event = eventIdFromParams(params);
      const registration = registrationIdFromParams(params);

      if (event === null) {
        return yield* apiFailure(API_PROBLEM.invalidEventId);
      }

      if (registration === null) {
        return yield* apiFailure(API_PROBLEM.invalidRegistrationId);
      }

      const db = createEngineDb(env.EVENT_ENGINE_DB);
      const [eventDetail, record, due] = yield* Effect.all([
        Effect.promise(() => db.events.findWithLimits(event)),
        Effect.promise(() => db.registrations.findById(event, registration)),
        Effect.promise(() => db.payments.findDue(event, registration)),
      ]);

      if (eventDetail === null) {
        return yield* apiFailure(API_PROBLEM.eventNotFound);
      }

      if (record === null || due === null) {
        return yield* apiFailure(API_PROBLEM.registrationNotFound);
      }

      const user = locals.user;

      if (user === null) {
        return yield* apiFailure(API_PROBLEM.forbidden);
      }

      const result = yield* Effect.promise(() =>
        db.payments.upsert({
          eventId: event,
          registrationId: registration,
          amountMinor: body.amountMinor ?? due.amountMinor,
          currency: due.currency,
          method: body.method,
          confirmedBy: user.id,
          note: body.note ?? null,
        }),
      );

      if (result === null) {
        return yield* apiFailure(API_PROBLEM.paymentUpdateFailed);
      }

      const { payment, created } = result;
      let emailQueued = false;

      if (created) {
        const token = yield* issueStatusToken(db.registrationStatus, registration);
        const statusUrl = statusPageUrl(
          new URL(request.url).origin,
          eventDetail.defaultLocale,
          token.token,
        );

        emailQueued = yield* Effect.promise(() =>
          enqueuePaymentConfirmedEmail(env, {
            eventId: event,
            registrationId: registration,
            paymentId: payment.id,
            statusUrl,
          }),
        );
      }

      return { payment, emailQueued, created };
    });

    return runApiEffect(program, (value) => json(value, 200));
  }),
);

export const DELETE: APIRoute = withStaffRoute(async ({ locals, params }) => {
  const event = eventIdFromParams(params);
  const registration = registrationIdFromParams(params);

  if (event === null) {
    return invalidEventId();
  }

  if (registration === null) {
    return invalidRegistrationId();
  }

  if (locals.user === null) {
    return forbidden();
  }

  const removed = await createEngineDb(env.EVENT_ENGINE_DB).payments.remove(
    event,
    registration,
    locals.user.id,
  );

  if (!removed) {
    return json({ error: "payment_not_found" }, 404);
  }

  return json({ removed: true }, 200);
});
