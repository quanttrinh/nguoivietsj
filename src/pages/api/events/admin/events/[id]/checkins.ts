import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { Effect } from "effect";

import { createEngineDb } from "~/db/events";
import { checkinCreateSchema } from "~/events/domain/validation";
import { json } from "~/events/server/http";
import { apiFailure, runApiEffect } from "~/shared/server/api/effect";
import { eventIdFromParams } from "~/shared/server/api/params";
import { API_PROBLEM } from "~/shared/server/api/problems";
import { eventNotFound, invalidEventId } from "~/shared/server/api/responses";
import { withStaffRoute, withValidatedBody } from "~/shared/server/api/route-decorators";

export const prerender = false;

const CHECKIN_LIST_LIMIT = 100;

export const GET: APIRoute = withStaffRoute(async ({ params }) => {
  const id = eventIdFromParams(params);

  if (id === null) {
    return invalidEventId();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const event = await db.events.findWithLimits(id);

  if (event === null) {
    return eventNotFound();
  }

  const [checkins, total] = await Promise.all([
    db.checkins.listByEvent(id, CHECKIN_LIST_LIMIT),
    db.checkins.countByEvent(id),
  ]);

  return json({ event, checkins, total }, 200);
});

export const POST: APIRoute = withStaffRoute(
  withValidatedBody(checkinCreateSchema, ({ params }, body) => {
    const program = Effect.gen(function* checkinProgram() {
      const id = eventIdFromParams(params);

      if (id === null) {
        return yield* apiFailure(API_PROBLEM.invalidEventId);
      }

      const db = createEngineDb(env.EVENT_ENGINE_DB);
      const exists = yield* Effect.promise(() => db.events.existsById(id));

      if (!exists) {
        return yield* apiFailure(API_PROBLEM.eventNotFound);
      }

      const registration = yield* Effect.promise(() =>
        db.registrations.findById(id, body.registrationId),
      );

      if (registration === null) {
        return yield* apiFailure(API_PROBLEM.registrationNotFound);
      }

      const [due, payment] = yield* Effect.all([
        Effect.promise(() => db.payments.findDue(id, body.registrationId)),
        Effect.promise(() => db.payments.findByRegistrationId(body.registrationId)),
      ]);

      if (due !== null && due.amountMinor > 0 && payment === null) {
        return yield* apiFailure(API_PROBLEM.paymentRequired);
      }

      const existing = yield* Effect.promise(() =>
        db.checkins.findByRegistration(id, body.registrationId),
      );

      if (existing !== null) {
        return { registration, checkin: existing, alreadyCheckedIn: true };
      }

      const checkin = yield* Effect.promise(() => db.checkins.create(id, body.registrationId));

      if (checkin === null) {
        return yield* apiFailure(API_PROBLEM.checkinFailed);
      }

      return { registration, checkin, alreadyCheckedIn: false };
    });

    return runApiEffect(program, (value) => json(value, value.alreadyCheckedIn ? 200 : 201));
  }),
);
