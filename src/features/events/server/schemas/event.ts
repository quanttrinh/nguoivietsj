// @boundary server
import { type } from "arktype";

import { EVENT_STATUS } from "~/features/events/domain/constants";
import { DEFAULT_TIMEZONE } from "~/features/events/domain/defaults";
import { LIMITS } from "~/features/events/domain/limits";
import { EVENT_SLUG_REGEX, EVENT_TYPE_REGEX } from "~/features/events/domain/patterns";
import {
  emailSchema,
  localizedTextSchema,
  nullableTimestampSchema,
  patternStringSchema,
  urlSchema,
} from "~/features/events/domain/schemas/common";
import { DEFAULT_LOCALE, locales } from "~/platform/i18n";

import { eventNotesSchema } from "./notes";
import { ticketTypeSchema } from "./tickets";

const localeSchema = type.enumerated(...locales);

export const eventSlugSchema = patternStringSchema(EVENT_SLUG_REGEX, LIMITS.event.slug);

const locationPayloadSchema = type({
  name: type(`string <= ${LIMITS.event.locationName}`),
  address: type(`string <= ${LIMITS.event.locationAddress}`),
  "mapUrl?": urlSchema.or(type("null")),
  "mapEmbedUrl?": urlSchema.or(type("null")),
});

export const locationSchema = locationPayloadSchema.pipe((value) => ({
  ...value,
  mapUrl: value.mapUrl ?? null,
  mapEmbedUrl: value.mapEmbedUrl ?? null,
}));
export type EventLocation = typeof locationSchema.infer;

const etransferPaymentSchema = type({
  "enabled?": type("boolean"),
  "email?": emailSchema.or(type("null")),
});

const cashPaymentSchema = type({
  "enabled?": type("boolean"),
  "address?": type(`string <= ${LIMITS.event.cashAddress}`).or(type("null")),
  "mapUrl?": urlSchema.or(type("null")),
  "mapEmbedUrl?": urlSchema.or(type("null")),
});

const paymentsPayloadSchema = type({
  "etransfer?": etransferPaymentSchema,
  "cash?": cashPaymentSchema,
});

export const paymentsSchema = paymentsPayloadSchema.pipe((value) => ({
  etransfer: {
    enabled: value.etransfer?.enabled ?? false,
    email: value.etransfer?.email ?? null,
  },
  cash: {
    enabled: value.cash?.enabled ?? false,
    address: value.cash?.address ?? null,
    mapUrl: value.cash?.mapUrl ?? null,
    mapEmbedUrl: value.cash?.mapEmbedUrl ?? null,
  },
}));
export type EventPayments = typeof paymentsSchema.infer;

const limitsPayloadSchema = type({
  currency: patternStringSchema(/^[A-Z]{3}$/u, LIMITS.text.currency, LIMITS.text.currency),
  "maxTicketsPerRegistration?": type("0 <= number.integer <= 1000000 | null"),
  "maxTotalTickets?": type("0 <= number.integer <= 1000000 | null"),
});

export const limitsSchema = limitsPayloadSchema.pipe((value) => ({
  ...value,
  maxTicketsPerRegistration: value.maxTicketsPerRegistration ?? null,
  maxTotalTickets: value.maxTotalTickets ?? null,
}));
export type EventTicketLimits = typeof limitsSchema.infer;

const eventCreatePayloadSchema = type({
  slug: eventSlugSchema,
  eventType: patternStringSchema(EVENT_TYPE_REGEX, LIMITS.event.type),
  editionYear: type(
    `${LIMITS.event.editionYearMin} <= number.integer <= ${LIMITS.event.editionYearMax}`,
  ),
  "defaultLocale?": localeSchema,
  "aliases?": eventSlugSchema.array().atMostLength(LIMITS.event.aliases),
  title: localizedTextSchema,
  "summary?": localizedTextSchema,
  "startsAt?": nullableTimestampSchema,
  "endsAt?": nullableTimestampSchema,
  "timezone?": type(`1 <= string <= ${LIMITS.event.timezone}`),
  "status?": type.valueOf(EVENT_STATUS),
  "enabled?": type("boolean"),
  "registrationOpen?": type("boolean"),
  limits: limitsSchema,
  "location?": locationSchema,
  "payments?": paymentsSchema,
  "notes?": eventNotesSchema,
  ticketTypes: ticketTypeSchema.array().atLeastLength(1).atMostLength(LIMITS.event.ticketTypes),
});

export const eventCreateSchema = eventCreatePayloadSchema.pipe((value) => ({
  ...value,
  defaultLocale: value.defaultLocale ?? DEFAULT_LOCALE,
  aliases: value.aliases ?? [],
  summary: value.summary ?? {},
  startsAt: value.startsAt ?? null,
  endsAt: value.endsAt ?? null,
  timezone: value.timezone ?? DEFAULT_TIMEZONE,
  status: value.status ?? EVENT_STATUS.draft,
  enabled: value.enabled ?? false,
  registrationOpen: value.registrationOpen ?? false,
  location: value.location ?? {
    name: "",
    address: "",
    mapUrl: null,
    mapEmbedUrl: null,
  },
  payments: value.payments ?? {
    etransfer: { enabled: false, email: null },
    cash: { enabled: false, address: null, mapUrl: null, mapEmbedUrl: null },
  },
  notes: value.notes ?? {},
}));
export type EventCreateInput = typeof eventCreateSchema.infer;

export const eventUpdateSchema = type({
  "defaultLocale?": localeSchema,
  "aliases?": eventSlugSchema.array().atMostLength(LIMITS.event.aliases),
  "title?": localizedTextSchema,
  "summary?": localizedTextSchema,
  "startsAt?": nullableTimestampSchema,
  "endsAt?": nullableTimestampSchema,
  "timezone?": type(`1 <= string <= ${LIMITS.event.timezone}`),
  "status?": type.valueOf(EVENT_STATUS),
  "enabled?": type("boolean"),
  "registrationOpen?": type("boolean"),
  "limits?": limitsSchema,
  "location?": locationSchema,
  "payments?": paymentsSchema,
  "notes?": eventNotesSchema,
});
export type EventUpdateInput = typeof eventUpdateSchema.infer;
