import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { registrationAmountDue } from "~/events/domain/presentation";
import { createCheckinQrSvg } from "~/events/server/checkin-qr";
import { hashStatusToken } from "~/events/server/status";
import { STATUS_TOKEN_REGEX } from "~/shared/constants/patterns";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const token = params.token ?? "";

  if (!STATUS_TOKEN_REGEX.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const access = await db.registrationStatus.findByTokenHash(
    await hashStatusToken(token),
    new Date().toISOString(),
  );

  if (access === null) {
    return new Response("Not found", { status: 404 });
  }

  const [event, registration] = await Promise.all([
    db.events.findWithLimits(access.eventId),
    db.registrations.findById(access.eventId, access.registrationId),
  ]);

  if (event === null || registration === null) {
    return new Response("Not found", { status: 404 });
  }

  const [payment, checkin] = await Promise.all([
    db.payments.findByRegistrationId(registration.id),
    db.checkins.findByRegistration(event.id, registration.id),
  ]);
  const amountDue = registrationAmountDue(registration);
  const paid = payment !== null || amountDue === 0;

  return Response.json(
    {
      event: {
        id: event.id,
        slug: event.slug,
        defaultLocale: event.defaultLocale,
        timezone: event.timezone,
        title: event.title,
        payments: event.payments,
        limits: event.limits,
      },
      registration,
      payment,
      checkin,
      amountDue,
      currency: registration.tickets[0]?.currency ?? event.limits.currency,
      paid,
      qrSvg: paid ? createCheckinQrSvg(registration.id) : null,
    },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
};
