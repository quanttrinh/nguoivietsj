import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { json } from "~/events/server/http";
import { eventIdFromParams, registrationIdFromParams } from "~/shared/server/api/params";
import { invalidEventId, invalidRegistrationId } from "~/shared/server/api/responses";
import { withStaffRoute } from "~/shared/server/api/route-decorators";

export const prerender = false;

export const DELETE: APIRoute = withStaffRoute(async ({ params }) => {
  const event = eventIdFromParams(params);
  const registration = registrationIdFromParams(params);

  if (event === null) {
    return invalidEventId();
  }

  if (registration === null) {
    return invalidRegistrationId();
  }

  const removed = await createEngineDb(env.EVENT_ENGINE_DB).checkins.remove(event, registration);

  if (!removed) {
    return json({ error: "checkin_not_found" }, 404);
  }

  return json({ removed: true }, 200);
});
