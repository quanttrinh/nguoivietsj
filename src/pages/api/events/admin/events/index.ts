import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { classifyDatabaseError, DATABASE_ERROR } from "~/db/events/errors";
import { toEventCreateInput } from "~/events/domain/input";
import {
  eventCreateSchema,
  validateEventDates,
  validateEventDetails,
  validateEventLocale,
  validateEventNotes,
  validateTicketTypes,
} from "~/events/domain/validation";
import { invalidateEventList } from "~/events/server/cache";
import { json } from "~/events/server/http";
import { invalidPayload } from "~/shared/server/api/responses";
import {
  withAdminRoute,
  withStaffRoute,
  withValidatedBody,
} from "~/shared/server/api/route-decorators";

export const prerender = false;

export const GET: APIRoute = withStaffRoute(async ({ locals }) => {
  const events = await createEngineDb(env.EVENT_ENGINE_DB).events.list();

  return json({ role: locals.user?.role ?? "staff", events }, 200);
});

export const POST: APIRoute = withAdminRoute(
  withValidatedBody(eventCreateSchema, async ({ cache }, body) => {
    const input = toEventCreateInput(body);

    if (!validateEventDates(input.startsAt, input.endsAt)) {
      return invalidPayload(["startsAt", "endsAt"]);
    }

    const detailFields = [
      ...validateEventDetails(input.location, input.payments),
      ...validateEventLocale({
        defaultLocale: input.defaultLocale,
        title: input.title,
        aliases: input.aliases,
        slug: input.slug,
      }),
      ...validateEventNotes(input.notes),
    ];

    if (detailFields.length > 0) {
      return invalidPayload(detailFields);
    }

    const ticketFields = validateTicketTypes(input.ticketTypes);

    if (ticketFields.length > 0) {
      return invalidPayload(ticketFields);
    }

    try {
      const event = await createEngineDb(env.EVENT_ENGINE_DB).events.create(input);
      await invalidateEventList(cache);
      return json({ event }, 201);
    } catch (error) {
      const databaseCode = classifyDatabaseError(error).code;

      if (
        databaseCode === DATABASE_ERROR.eventConflict ||
        databaseCode === DATABASE_ERROR.uniqueConstraint
      ) {
        return json({ error: "event_exists" }, 409);
      }

      console.error("Failed to create event", error);
      return json({ error: "event_create_failed" }, 500);
    }
  }),
);
