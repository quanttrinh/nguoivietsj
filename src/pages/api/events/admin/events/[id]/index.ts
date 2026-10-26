import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { classifyDatabaseError, DATABASE_ERROR } from "~/db/events/errors";
import { toEventUpdateInput } from "~/events/domain/input";
import type { EventDetail } from "~/events/domain/types";
import {
  eventUpdateSchema,
  validateEventDates,
  validateEventDetails,
  validateEventLocale,
  validateEventNotes,
} from "~/events/domain/validation";
import { invalidateEventList, invalidateEventPage } from "~/events/server/cache";
import { json } from "~/events/server/http";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId, invalidPayload } from "~/shared/server/api/responses";
import {
  withAdminRoute,
  withStaffRoute,
  withValidatedBody,
} from "~/shared/server/api/route-decorators";

export const prerender = false;

export const GET: APIRoute = withStaffRoute(async ({ params }) => {
  const id = eventIdFromParams(params);

  if (id === null) {
    return invalidEventId();
  }

  const event = await createEngineDb(env.EVENT_ENGINE_DB).events.findDetail(id);

  if (event === null) {
    return eventNotFound();
  }

  return json({ event }, 200);
});

export const PATCH: APIRoute = withAdminRoute(
  withValidatedBody(eventUpdateSchema, async ({ cache, params }, body) => {
    const id = eventIdFromParams(params);

    if (id === null) {
      return invalidEventId();
    }

    const db = createEngineDb(env.EVENT_ENGINE_DB);
    const current = await db.events.findDetail(id);

    if (current === null) {
      return eventNotFound();
    }

    const startsAt = body.startsAt === undefined ? current.startsAt : body.startsAt;
    const endsAt = body.endsAt === undefined ? current.endsAt : body.endsAt;

    if (!validateEventDates(startsAt, endsAt)) {
      return invalidPayload(["startsAt", "endsAt"]);
    }

    const input = toEventUpdateInput(body);
    const detailFields = [
      ...validateEventDetails(input.location, input.payments),
      ...validateEventLocale({
        defaultLocale: body.defaultLocale ?? current.defaultLocale,
        title: body.title ?? current.title,
        aliases: body.aliases ?? current.aliases,
        slug: current.slug,
      }),
      ...validateEventNotes(input.notes),
    ];

    if (detailFields.length > 0) {
      return invalidPayload(detailFields);
    }
    // oxlint-disable-next-line eslint/init-declarations -- assigned inside try/catch.
    let event: EventDetail | null;

    try {
      event = await db.events.update(id, input);
    } catch (error) {
      const databaseCode = classifyDatabaseError(error).code;

      if (
        databaseCode === DATABASE_ERROR.eventConflict ||
        databaseCode === DATABASE_ERROR.uniqueConstraint
      ) {
        return json({ error: "event_exists" }, 409);
      }

      console.error("Failed to update event", error);
      return json({ error: "event_update_failed" }, 500);
    }

    if (event === null) {
      return eventNotFound();
    }

    await Promise.all([invalidateEventPage(cache, id), invalidateEventList(cache)]);

    return json({ event }, 200);
  }),
);
