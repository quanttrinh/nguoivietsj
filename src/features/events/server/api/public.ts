// @boundary server
/* oxlint-disable import/max-dependencies -- Public router wiring is explicit. */
import { sValidator } from "@hono/standard-validator";
import { type } from "arktype";
import { type Context, Hono } from "hono";
import { cache } from "hono/cache";

import { CONTACT_KIND } from "~/features/events/domain/constants";
import { resolvePublishedForm } from "~/features/events/domain/form-schema";
import { REGISTRATION_TURNSTILE_ACTION } from "~/features/events/domain/registration";
import { eventSlugSchema } from "~/features/events/server/schemas/event";
import { registrationSchema } from "~/features/events/server/schemas/registration";
import { registrationCreatedResponse } from "~/features/events/server/services/registration-response";
import {
  createRegistration,
  RegistrationFailureError,
} from "~/features/events/server/services/registration-service";
import { SUPPORTED_LOCALES } from "~/platform/i18n";
import { apiSuccess } from "~/platform/server/api/helpers/responses/api-response";
import { notFound, rateLimited } from "~/platform/server/api/helpers/responses/common-responses";
import { defaultValidationHandler } from "~/platform/server/api/helpers/validation/validation-handler";
import {
  getEventRepository,
  getFormVersionRepository,
  getRegistrationRepository,
} from "~/platform/server/db/events";
import { apiBodyLimit } from "~/platform/server/middleware/body-limit";
import {
  checkRateLimit,
  clientKey,
  emailKey,
  rateLimit,
  type RateLimitSettings,
} from "~/platform/server/middleware/rate-limit";
import { requireTurnstile } from "~/platform/server/middleware/turnstile";

import { registrationFailureResponse } from "./registration-errors";

const eventsParamSchema = type({
  slug: eventSlugSchema,
});

const MAX_PUBLIC_REGISTRATION_BODY_BYTES = 64 * 1024;

const eventsQuerySchema = type({
  "locale?": "string",
  "+": "reject",
});

const registrationParamSchema = type({
  slug: eventSlugSchema,
});

const registrationIpRateLimit = {
  limiter: (env) => env.EVENT_ENGINE_REGISTRATION_RATE_LIMITER,
  scope: "registration",
  key: (request) => clientKey("registration", request),
  label: "Registration rate limiter",
} satisfies RateLimitSettings;

function registrationEmailRateLimit(email: string): RateLimitSettings {
  return {
    limiter: (env) => env.EVENT_ENGINE_REGISTRATION_RATE_LIMITER,
    scope: "registration-email",
    key: () => emailKey("registration-email", email),
    label: "Registration email rate limiter",
  };
}

function metadataLocale(metadata: Record<string, unknown>, fallback: string) {
  const locale = metadata.locale;

  return typeof locale === "string" && SUPPORTED_LOCALES.has(locale) ? locale : fallback;
}

/**
 * Cache on path plus a validated locale only.
 *
 * Hono's default key is the full URL, so `?x=<random>` always missed the cache
 * and reached D1. Unknown query keys are rejected by the validator above.
 */
function eventCacheKey(ctx: Context, path: string) {
  const requestUrl = new URL(ctx.req.url);
  const key = new URL(path, requestUrl.origin);
  const locale = requestUrl.searchParams.get("locale");

  if (locale !== null && SUPPORTED_LOCALES.has(locale)) {
    key.searchParams.set("locale", locale);
  }

  return key.href;
}

export const publicEvents = new Hono<HonoEnv>()
  .get(
    "/",
    cache({
      cacheName: "event-list",
      cacheControl: "public, max-age=60, s-maxage=300",
      keyGenerator: (ctx) => eventCacheKey(ctx, "/api/events"),
      wait: true,
    }),
    async (context) => {
      const events = await getEventRepository(context.env.EVENT_ENGINE_DB).listPublicSummaries(
        new Date().toISOString(),
      );

      return apiSuccess(
        context,
        { events },
        {
          headers: { "cache-control": "public, max-age=60, s-maxage=300" },
        },
      );
    },
  )
  .get(
    "/:slug",
    // Validate first so unknown query keys get a 400 instead of a cached 200.
    sValidator("param", eventsParamSchema, defaultValidationHandler),
    sValidator("query", eventsQuerySchema, defaultValidationHandler),
    cache({
      cacheName: "event-detail",
      cacheControl: "public, max-age=60, s-maxage=300",
      keyGenerator: (ctx) =>
        eventCacheKey(ctx, `/api/events/${encodeURIComponent(ctx.req.param("slug") ?? "")}`),
      wait: true,
    }),
    async (ctx) => {
      const { slug } = ctx.req.valid("param");

      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const detail = await getEventRepository(engineDb).findPublicDetailBySlug(
        slug,
        new Date().toISOString(),
      );

      if (detail == null) {
        return notFound(ctx);
      }

      const localeParam = ctx.req.valid("query").locale;
      const locale =
        localeParam !== undefined && SUPPORTED_LOCALES.has(localeParam)
          ? localeParam
          : detail.defaultLocale;
      const formVersion = await getFormVersionRepository(engineDb).findPublished(detail.id);
      const activeTicketTypes = detail.ticketTypes.filter((ticketType) => ticketType.active);
      const form =
        formVersion !== null && activeTicketTypes.length > 0
          ? resolvePublishedForm(detail, formVersion, locale)
          : null;
      const ticketTypes = activeTicketTypes.map((ticketType) => ({
        key: ticketType.key,
        label: ticketType.label,
        description: ticketType.description,
        priceMinor: ticketType.priceMinor,
        currency: detail.limits.currency,
        minPerRegistration: ticketType.minPerRegistration,
        maxPerRegistration: ticketType.maxPerRegistration,
        defaultQuantity: ticketType.defaultQuantity,
        capacity: ticketType.capacity,
        remaining:
          ticketType.capacity === null
            ? null
            : Math.max(ticketType.capacity - ticketType.ticketsSold, 0),
        sortOrder: ticketType.sortOrder,
      }));

      return apiSuccess(
        ctx,
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
        { headers: { "cache-control": "public, max-age=60, s-maxage=300" } },
      );
    },
  )
  .post(
    "/:slug/registrations",
    rateLimit(registrationIpRateLimit),
    requireTurnstile(REGISTRATION_TURNSTILE_ACTION),
    apiBodyLimit(MAX_PUBLIC_REGISTRATION_BODY_BYTES),
    sValidator("param", registrationParamSchema, defaultValidationHandler),
    sValidator("json", registrationSchema, defaultValidationHandler),
    async (ctx) => {
      const { slug } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const emailContact =
        body.contacts.find(
          (contact) => contact.kind === CONTACT_KIND.email && contact.isConfirmation,
        ) ?? body.contacts.find((contact) => contact.kind === CONTACT_KIND.email);
      const email = emailContact?.kind === CONTACT_KIND.email ? emailContact.email : null;
      if (email !== null) {
        const emailLimited = await checkRateLimit(
          ctx.req.raw,
          ctx.env,
          registrationEmailRateLimit(email),
        );

        if (!emailLimited.allowed) {
          return rateLimited(ctx, emailLimited.retryAfterSeconds);
        }
      }

      const engineDb = ctx.env.EVENT_ENGINE_DB;
      const detail = await getEventRepository(engineDb).findPublicDetailBySlug(
        slug,
        new Date().toISOString(),
      );

      if (detail == null) {
        return notFound(ctx);
      }

      let registration;

      try {
        registration = await createRegistration({
          registrations: getRegistrationRepository(engineDb),
          event: detail,
          registration: body,
          enforceRegistrationOpen: true,
        });
      } catch (error) {
        if (error instanceof RegistrationFailureError) {
          return registrationFailureResponse(ctx, error);
        }

        throw error;
      }

      return registrationCreatedResponse(ctx, {
        env: ctx.env,
        eventId: detail.id,
        locale: metadataLocale(body.metadata, detail.defaultLocale),
        registration,
      });
    },
  );
