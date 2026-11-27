// @boundary server
import { type } from "arktype";

import { EVENT_STATUS } from "~/features/events/domain/constants";
import { DEFAULT_TIMEZONE } from "~/features/events/domain/defaults";
import { LIMITS } from "~/features/events/domain/limits";
import {
  emailSchema,
  localizedTextSchema,
  nullableTimestampSchema,
  urlSchema,
} from "~/features/events/domain/schemas/common";
import { localeSchema } from "~/generated/i18n-types";
import { DEFAULT_LOCALE } from "~/platform/i18n";

import { eventNotesSchema } from "./notes";
import { ticketTypeSchema } from "./tickets";

export const eventSlugSchema = type(`1 <= string <= ${LIMITS.event.slug}`).matching(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
);

export const locationSchema = type({
  name: type(`string <= ${LIMITS.event.locationName}`),
  address: type(`string <= ${LIMITS.event.locationAddress}`),
  mapUrl: urlSchema.or(type("null")).default(null),
  mapEmbedUrl: urlSchema.or(type("null")).default(null),
});
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

export const limitsSchema = type({
  currency: type(`${LIMITS.text.currency} <= string <= ${LIMITS.text.currency}`).matching(
    /^[A-Z]{3}$/u,
  ),
  maxTicketsPerRegistration: type("0 <= number.integer <= 1000000 | null").default(null),
  maxTotalTickets: type("0 <= number.integer <= 1000000 | null").default(null),
});
export type EventTicketLimits = typeof limitsSchema.infer;

const eventCreatePayloadSchema = type({
  slug: eventSlugSchema,
  eventType: type(`1 <= string <= ${LIMITS.event.type}`).matching(/^[a-z][a-z0-9-]*$/u),
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
