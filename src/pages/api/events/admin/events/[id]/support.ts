import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import type {
  RegistrationCheckinFilter,
  RegistrationPaymentFilter,
} from "~/db/events/registrations";
import { json } from "~/events/server/http";
import { eventIdFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventId } from "~/shared/server/api/responses";
import { withStaffRoute } from "~/shared/server/api/route-decorators";

export const prerender = false;

const PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 40;

function paymentFilter(value: string | null): RegistrationPaymentFilter | undefined {
  return value === "paid" || value === "unpaid" ? value : undefined;
}

function checkinFilter(value: string | null): RegistrationCheckinFilter | undefined {
  return value === "checked_in" || value === "not_checked_in" ? value : undefined;
}

export const GET: APIRoute = withStaffRoute(async ({ params, url }) => {
  const id = eventIdFromParams(params);

  if (id === null) {
    return invalidEventId();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const event = await db.events.findWithLimits(id);

  if (event === null) {
    return eventNotFound();
  }

  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const payment = paymentFilter(url.searchParams.get("payment"));
  const checkin = checkinFilter(url.searchParams.get("checkin"));
  const requestedPage = Math.trunc(Number(url.searchParams.get("page") ?? "1"));
  const page = Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1);
  const result = await db.registrations.searchByEvent(id, {
    query,
    payment,
    checkin,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const registrationIds = result.registrations.map((registration) => registration.id);
  const [payments, checkins] = await Promise.all([
    db.payments.findByRegistrationIds(registrationIds),
    db.checkins.findByRegistrationIds(id, registrationIds),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return json(
    {
      event,
      registrations: result.registrations,
      payments,
      checkins,
      page,
      pageSize: PAGE_SIZE,
      total: result.total,
      totalPages,
      filters: { query, payment: payment ?? null, checkin: checkin ?? null },
    },
    200,
  );
});
