import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import type { TicketTypeInput } from "~/events/domain/types";
import { ticketTypeSchema, validateTicketTypes } from "~/events/domain/validation";
import { invalidateEventPage } from "~/events/server/cache";
import { json } from "~/events/server/http";
import { API_ERROR } from "~/shared/constants/api-errors";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId } from "~/shared/server/api/responses";
import { withAdminRoute, withValidatedBody } from "~/shared/server/api/route-decorators";

export const prerender = false;

export const GET: APIRoute = withAdminRoute(async ({ params }) => {
  const id = eventIdFromParams(params);

  if (id === null) {
    return invalidEventId();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  if (!(await db.events.existsById(id))) {
    return eventNotFound();
  }

  const ticketTypes = await db.ticketTypes.listByEvent(id);

  return json({ ticketTypes }, 200);
});

export const POST: APIRoute = withAdminRoute(
  withValidatedBody(ticketTypeSchema, async ({ cache, params }, body) => {
    const id = eventIdFromParams(params);

    if (id === null) {
      return invalidEventId();
    }

    const ticketType: TicketTypeInput = {
      ...body,
      description: body.description ?? null,
    };
    const fields = validateTicketTypes([ticketType]);

    if (fields.length > 0) {
      return json({ error: API_ERROR.invalidPayload, fields }, 400);
    }

    const db = createEngineDb(env.EVENT_ENGINE_DB);
    if (!(await db.events.existsById(id))) {
      return eventNotFound();
    }

    const existing = await db.ticketTypes.findByKey(id, ticketType.key);

    if (existing !== null) {
      return json({ error: "ticket_type_exists" }, 409);
    }

    try {
      const created = await db.ticketTypes.create(id, ticketType);
      await invalidateEventPage(cache, id);
      return json({ ticketType: created }, 201);
    } catch (error) {
      console.error("Failed to create ticket type", error);
      return json({ error: "ticket_type_create_failed" }, 500);
    }
  }),
);
