import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { resolveRegistrationForm } from "~/events/domain/form-schema";
import type { FormSchema } from "~/events/domain/form-schema/types";
import { eventCacheTag } from "~/events/server/cache";
import { json } from "~/events/server/http";
import { SUPPORTED_LOCALES } from "~/shared/constants/locales";
import { eventSlugFromParams } from "~/shared/server/api/params";
import { eventNotFound, invalidEventSlug } from "~/shared/server/api/responses";

export const prerender = false;

export const GET: APIRoute = async ({ cache, params, url }) => {
  const slug = eventSlugFromParams(params);

  if (slug === null) {
    return invalidEventSlug();
  }

  const db = createEngineDb(env.EVENT_ENGINE_DB);
  const detail = await db.events.findPublicDetailBySlug(slug, new Date().toISOString());

  if (detail === null) {
    return eventNotFound();
  }

  if (cache.enabled) {
    cache.set({
      tags: [eventCacheTag(detail.id)],
    });
  }

  const localeParam = url.searchParams.get("locale");
  const locale =
    localeParam !== null && SUPPORTED_LOCALES.has(localeParam) ? localeParam : detail.defaultLocale;
  const formVersion = await db.formVersions.findPublished(detail.id);
  const activeTicketTypes = detail.ticketTypes.filter((type) => type.active);
  const form =
    formVersion !== null && activeTicketTypes.length > 0
      ? resolveRegistrationForm({
          event: detail,
          schema: formVersion.schema as unknown as FormSchema,
          formVersion: formVersion.version,
          locale,
        })
      : null;
  const ticketTypes = detail.ticketTypes
    .filter((type) => type.active)
    .map((type) => ({
      key: type.key,
      label: type.label,
      description: type.description,
      priceMinor: type.priceMinor,
      currency: detail.limits.currency,
      minPerRegistration: type.minPerRegistration,
      maxPerRegistration: type.maxPerRegistration,
      defaultQuantity: type.defaultQuantity,
      capacity: type.capacity,
      remaining: type.capacity === null ? null : Math.max(type.capacity - type.ticketsSold, 0),
      sortOrder: type.sortOrder,
    }));

  return json(
    {
      event: {
        id: detail.id,
        slug: detail.slug,
        eventType: detail.eventType,
        editionYear: detail.editionYear,
        defaultLocale: detail.defaultLocale,
        aliases: detail.aliases,
        status: detail.status,
        startsAt: detail.startsAt,
        endsAt: detail.endsAt,
        timezone: detail.timezone,
        title: detail.title,
        summary: detail.summary,
        location: detail.location,
        payments: detail.payments,
        notes: detail.notes,
        registrationOpen: detail.registrationOpen,
        registrationCount: detail.registrationCount,
        ticketsTotal: detail.ticketsTotal,
        limits: detail.limits,
        remainingTotal:
          detail.limits.maxTotalTickets === null
            ? null
            : Math.max(detail.limits.maxTotalTickets - detail.ticketsTotal, 0),
      },
      ticketTypes,
      form,
    },
    200,
  );
};
