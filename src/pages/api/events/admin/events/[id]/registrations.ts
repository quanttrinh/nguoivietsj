import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { Effect, Result } from "effect";

import { createEngineDb } from "~/db/events";
import { toRegistrationInput } from "~/events/domain/input";
import { MAX_REGISTRATION_LIST_LIMIT } from "~/events/domain/limits";
import { registrationSchema } from "~/events/domain/validation";
import { statusPageUrl } from "~/events/server/email";
import { enqueueRegistrationReceivedEmail } from "~/events/server/email-queue";
import { json } from "~/events/server/http";
import { createRegistration } from "~/events/server/registration-service";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId } from "~/shared/server/api/responses";
import {
  withAdminRoute,
  withStaffRoute,
  withValidatedBody,
} from "~/shared/server/api/route-decorators";

export const prerender = false;

export const GET: APIRoute = withStaffRoute(async ({ params, url }) => {
  const id = eventIdFromParams(params);

  if (id === null) {
    return invalidEventId();
  }

  const requested = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 1), MAX_REGISTRATION_LIST_LIMIT)
    : 50;
  const db = createEngineDb(env.EVENT_ENGINE_DB);
  if (!(await db.events.existsById(id))) {
    return eventNotFound();
  }

  const registrations = await db.registrations.listByEvent(id, limit);

  return json({ registrations }, 200);
});

export const POST: APIRoute = withAdminRoute(
  withValidatedBody(registrationSchema, async ({ params, request }, body) => {
    const id = eventIdFromParams(params);

    if (id === null) {
      return invalidEventId();
    }

    const db = createEngineDb(env.EVENT_ENGINE_DB);
    const event = await db.events.findDetail(id);

    if (event === null) {
      return eventNotFound();
    }

    const registrationEffect = createRegistration({
      db,
      event,
      registration: toRegistrationInput(body),
      enforceRegistrationOpen: false,
    });
    const outcome = await Effect.runPromise(Effect.result(registrationEffect));

    if (Result.isFailure(outcome)) {
      const error = outcome.failure.error;

      return json(
        {
          error: error.error,
          ...(error.fields === undefined ? {} : { fields: error.fields }),
          ...(error.issues === undefined ? {} : { issues: error.issues }),
        },
        error.status,
      );
    }

    const registration = outcome.success;

    const statusUrl = statusPageUrl(
      new URL(request.url).origin,
      event.defaultLocale,
      registration.statusToken,
    );
    const emailQueued = await enqueueRegistrationReceivedEmail(env, {
      eventId: event.id,
      registrationId: registration.id,
      statusUrl,
      amountMinor: registration.amountMinor,
    });

    return json({ registration, emailQueued }, 201);
  }),
);
