import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { json } from "~/events/server/http";
import { USER_ROLE } from "~/shared/constants/roles";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId } from "~/shared/server/api/responses";
import { withStaffRoute } from "~/shared/server/api/route-decorators";

export const prerender = false;

const REGISTRATION_LIMIT = 25;
const CHECKIN_LIMIT = 100;

export const GET: APIRoute = withStaffRoute(async ({ locals, params }) => {
  const id = eventIdFromParams(params);

  if (id === null) {
    return invalidEventId();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const event = await db.events.findDetail(id);

  if (event === null) {
    return eventNotFound();
  }

  const role = locals.user?.role ?? "staff";
  const [registrations, checkins, formVersions] = await Promise.all([
    db.registrations.listSummariesByEvent(id, REGISTRATION_LIMIT),
    db.checkins.listByEvent(id, CHECKIN_LIMIT),
    role === USER_ROLE.admin ? db.formVersions.listByEvent(id) : Promise.resolve([]),
  ]);

  return json(
    {
      role,
      event,
      registrations,
      checkins,
      formVersions: formVersions.map(({ version, status, createdAt }) => ({
        version,
        status,
        createdAt,
      })),
    },
    200,
  );
});
