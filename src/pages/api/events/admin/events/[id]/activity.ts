import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { json } from "~/events/server/http";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId } from "~/shared/server/api/responses";
import { withStaffRoute } from "~/shared/server/api/route-decorators";

export const prerender = false;

const ACTIVITY_LIMIT = 200;

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

  const activity = await db.audit.listByEvent(id, ACTIVITY_LIMIT);

  return json({ event, activity }, 200);
});
