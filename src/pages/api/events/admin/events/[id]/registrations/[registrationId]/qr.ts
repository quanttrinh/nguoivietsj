import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { createCheckinQrSvg } from "~/events/server/checkin-qr";
import { json } from "~/events/server/http";
import { eventIdFromParams, registrationIdFromParams } from "~/shared/server/api/params";
import {
  eventNotFound,
  invalidEventId,
  invalidRegistrationId,
  registrationNotFound,
} from "~/shared/server/api/responses";
import { withStaffRoute } from "~/shared/server/api/route-decorators";

export const prerender = false;

export const GET: APIRoute = withStaffRoute(async ({ params }) => {
  const eventId = eventIdFromParams(params);
  const registrationId = registrationIdFromParams(params);

  if (eventId === null) {
    return invalidEventId();
  }

  if (registrationId === null) {
    return invalidRegistrationId();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const [event, registration] = await Promise.all([
    db.events.findWithLimits(eventId),
    db.registrations.findById(eventId, registrationId),
  ]);

  if (event === null) {
    return eventNotFound();
  }

  if (registration === null) {
    return registrationNotFound();
  }

  const [payment, due] = await Promise.all([
    db.payments.findByRegistrationId(registrationId),
    db.payments.findDue(eventId, registrationId),
  ]);
  const qrAvailable = payment !== null || (due?.amountMinor ?? 0) === 0;

  return json(
    {
      event,
      registration,
      payment,
      due,
      qrAvailable,
      qrSvg: qrAvailable ? createCheckinQrSvg(registrationId) : null,
    },
    200,
  );
});
