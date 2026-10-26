// @boundary server
/* oxlint-disable import/max-dependencies, eslint/no-underscore-dangle -- Public router wiring is explicit. */
import { sValidator } from "@hono/standard-validator";
import { type } from "arktype";
import { Hono } from "hono";
import { cache } from "hono/cache";

import {
  getEventRepository,
  getFormVersionRepository,
  getRegistrationRepository,
} from "~/db/events";
import { CONTACT_KIND } from "~/events/domain/constants";
import { resolveRegistrationForm } from "~/events/domain/form-schema";
import { formSchemaSchema } from "~/events/domain/form-schema/schema/schema";
import { REGISTRATION_TURNSTILE_ACTION } from "~/events/domain/registration";
import { eventSlugSchema } from "~/events/domain/schemas/event";
import { registrationSchema } from "~/events/domain/schemas/registration";
import { enqueueRegistrationReceivedEmail } from "~/events/services/email-queue";
import {
  createRegistration,
  RegistrationFailureError,
} from "~/events/services/registration-service";
import { statusPageUrl } from "~/events/services/status-url";
import { apiSuccess } from "~/server/api-response";
import { notFound, rateLimited } from "~/server/common-responses";
import {
  checkRateLimit,
  clientKey,
  emailKey,
  rateLimit,
  type RateLimitSettings,
} from "~/server/middleware/rate-limit";
import { requireTurnstile } from "~/server/middleware/turnstle";
import { registrationFailureResponse } from "~/server/routes/events/registration-errors";
import { defaultValidationHandler } from "~/server/validation-handler";
import { SUPPORTED_LOCALES } from "~/shared/constants/locales";

const eventsParamSchema = type({
  slug: eventSlugSchema,
});

const eventsQuerySchema = type({
  "locale?": "string",
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

function metadataLocale(metadata: Record<string, unknown>, fallback: string): string {
  const locale = metadata.locale;

  return typeof locale === "string" && SUPPORTED_LOCALES.has(locale) ? locale : fallback;
}

export const publicEvents = new Hono<HonoEnv>()
  .get(
    "/",
    cache({
      cacheName: "event-list",
      cacheControl: "public, max-age=60, s-maxage=300",
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
    cache({
      cacheName: "event-detail",
      cacheControl: "public, max-age=60, s-maxage=300",
      wait: true,
    }),
    sValidator("param", eventsParamSchema, defaultValidationHandler),
    sValidator("query", eventsQuerySchema, defaultValidationHandler),
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
      const schema = formVersion === null ? null : formSchemaSchema(formVersion.schema);
      const form =
        formVersion != null &&
        schema !== null &&
        !(schema instanceof type.errors) &&
        activeTicketTypes.length > 0
          ? resolveRegistrationForm({
              event: detail,
              schema,
              formVersion: formVersion.version,
              locale,
            })
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
    sValidator("json", registrationSchema, defaultValidationHandler),
    sValidator("param", registrationParamSchema, defaultValidationHandler),
    rateLimit(registrationIpRateLimit),
    requireTurnstile(REGISTRATION_TURNSTILE_ACTION),
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

      const statusUrl = statusPageUrl(
        new URL(ctx.req.url).origin,
        metadataLocale(body.metadata, detail.defaultLocale),
        registration.statusToken,
      );
      const emailQueued = await enqueueRegistrationReceivedEmail(ctx.env, {
        eventId: detail.id,
        registrationId: registration.id,
        statusUrl,
        amountMinor: registration.amountMinor,
      });

      return apiSuccess(
        ctx,
        { registration: { ...registration, statusUrl }, emailQueued },
        {
          status: 201,
          ...(emailQueued
            ? {}
            : { meta: { warnings: [{ code: "event_registration_email_not_queued" }] } }),
        },
      );
    },
  );
