import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { createCheckinQrSvg } from "~/events/server/checkin-qr";
import { hashStatusToken } from "~/events/server/status";
import { isUuidV7 } from "~/shared/utils/uuid";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const { id } = params;
  const token = url.searchParams.get("token") ?? "";

  if (id === undefined || !isUuidV7(id) || token.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const access = await db.registrationStatus.findByTokenHash(
    await hashStatusToken(token),
    new Date().toISOString(),
  );

  if (access === null || access.registrationId !== id) {
    return new Response("Not found", { status: 404 });
  }

  const [payment, due] = await Promise.all([
    db.payments.findByRegistrationId(id),
    db.payments.findDue(access.eventId, id),
  ]);

  if (due !== null && due.amountMinor > 0 && payment === null) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(createCheckinQrSvg(id), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
};
