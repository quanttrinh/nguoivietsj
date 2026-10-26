import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import type { TicketTypeInput } from "~/events/domain/types";
import { ticketTypeUpdateSchema, validateTicketTypes } from "~/events/domain/validation";
import { invalidateEventPage } from "~/events/server/cache";
import { json } from "~/events/server/http";
import { TICKET_KEY_REGEX } from "~/shared/constants/patterns";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId, invalidPayload } from "~/shared/server/api/responses";
import { withAdminRoute, withValidatedBody } from "~/shared/server/api/route-decorators";

export const prerender = false;

function ticketKey(params: Record<string, string | undefined>): string | null {
  const key = params.key ?? "";
  return TICKET_KEY_REGEX.test(key) ? key : null;
}

function mergeTicketType(
  current: TicketTypeInput,
  body: Partial<TicketTypeInput>,
): TicketTypeInput {
  return {
    key: current.key,
    label: body.label ?? current.label,
    description: body.description === undefined ? current.description : body.description,
    priceMinor: body.priceMinor ?? current.priceMinor,
    minPerRegistration: body.minPerRegistration ?? current.minPerRegistration,
    maxPerRegistration:
      body.maxPerRegistration === undefined ? current.maxPerRegistration : body.maxPerRegistration,
    defaultQuantity: body.defaultQuantity ?? current.defaultQuantity,
    capacity: body.capacity === undefined ? current.capacity : body.capacity,
    active: body.active ?? current.active,
    sortOrder: body.sortOrder ?? current.sortOrder,
  };
}

export const PATCH: APIRoute = withAdminRoute(
  withValidatedBody(ticketTypeUpdateSchema, async ({ cache, params }, body) => {
    const id = eventIdFromParams(params);
    const key = ticketKey(params);

    if (id === null) {
      return invalidEventId();
    }

    if (key === null) {
      return json({ error: "invalid_ticket_key" }, 400);
    }

    const db = createEngineDb(env.EVENT_ENGINE_DB);
    if (!(await db.events.existsById(id))) {
      return eventNotFound();
    }

    const current = await db.ticketTypes.findByKey(id, key);

    if (current === null) {
      return json({ error: "ticket_type_not_found" }, 404);
    }

    const input = mergeTicketType(current, body);
    const fields = validateTicketTypes([input]);

    if (fields.length > 0) {
      return invalidPayload(fields);
    }

    try {
      const ticketType = await db.ticketTypes.update(id, key, input);
      await invalidateEventPage(cache, id);
      return json({ ticketType }, 200);
    } catch (error) {
      console.error("Failed to update ticket type", error);
      return json({ error: "ticket_type_update_failed" }, 500);
    }
  }),
);
