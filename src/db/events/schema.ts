/* oxlint-disable typescript/explicit-function-return-type, eslint/max-lines -- Drizzle column builders infer precise types, and the schema is one catalog. */
import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type {
  EventNotes,
  EventStatus,
  FormVersionStatus,
  LocalizedText,
  PaymentMethod,
} from "~/events/domain/types";

const localizedText = (name: string) => text(name, { mode: "json" }).$type<LocalizedText>();

const timestamp = (name: string) =>
  text(name)
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    eventType: text("event_type").notNull(),
    editionYear: integer("edition_year").notNull(),
    defaultLocale: text("default_locale").notNull().default("en"),
    status: text("status").$type<EventStatus>().notNull().default("draft"),
    enabled: integer("enabled", { mode: "boolean" })
      .notNull()
      .default(sql`0`),
    registrationOpen: integer("registration_open", { mode: "boolean" })
      .notNull()
      .default(sql`0`),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    timezone: text("timezone").notNull().default("UTC"),
    titleJson: localizedText("title_json").notNull(),
    summaryJson: localizedText("summary_json").notNull().default({}),
    locationName: text("location_name").notNull().default(""),
    locationAddress: text("location_address").notNull().default(""),
    locationMapUrl: text("location_map_url"),
    locationMapEmbedUrl: text("location_map_embed_url"),
    paymentEtransferEnabled: integer("payment_etransfer_enabled", { mode: "boolean" })
      .notNull()
      .default(sql`0`),
    paymentEtransferEmail: text("payment_etransfer_email"),
    paymentCashEnabled: integer("payment_cash_enabled", { mode: "boolean" })
      .notNull()
      .default(sql`0`),
    paymentCashAddress: text("payment_cash_address"),
    paymentCashMapUrl: text("payment_cash_map_url"),
    paymentCashMapEmbedUrl: text("payment_cash_map_embed_url"),
    notesJson: text("notes_json", { mode: "json" }).$type<EventNotes>().notNull().default({}),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("events_slug_unique").on(table.slug),
    uniqueIndex("events_type_year_unique").on(table.eventType, table.editionYear),
    index("events_public_list").on(table.enabled, table.status, table.startsAt, table.id),
    check("events_edition_year", sql`${table.editionYear} BETWEEN 2000 AND 2100`),
    check("events_status", sql`${table.status} IN ('draft', 'upcoming', 'active', 'archived')`),
    check("events_enabled", sql`${table.enabled} IN (0, 1)`),
    check("events_registration_open", sql`${table.registrationOpen} IN (0, 1)`),
    check(
      "events_title_json",
      sql`json_valid(${table.titleJson}) AND json_type(${table.titleJson}) = 'object'`,
    ),
    check(
      "events_summary_json",
      sql`json_valid(${table.summaryJson}) AND json_type(${table.summaryJson}) = 'object'`,
    ),
    check("events_etransfer_enabled", sql`${table.paymentEtransferEnabled} IN (0, 1)`),
    check("events_cash_enabled", sql`${table.paymentCashEnabled} IN (0, 1)`),
    check(
      "events_dates",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`,
    ),
  ],
);

export const eventAliases = sqliteTable(
  "event_aliases",
  {
    alias: text("alias").primaryKey(),
    eventId: text("event_id").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("event_aliases_event_id").on(table.eventId),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
  ],
);

export const eventSlugClaims = sqliteTable(
  "event_slug_claims",
  {
    slug: text("slug").primaryKey(),
    eventId: text("event_id").notNull(),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("cascade"),
  ],
);

export const registrationStats = sqliteTable(
  "registration_stats",
  {
    eventId: text("event_id").primaryKey(),
    registrationCount: integer("registration_count").notNull().default(0),
    ticketsTotal: integer("tickets_total").notNull().default(0),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    check("registration_stats_count", sql`${table.registrationCount} >= 0`),
    check("registration_stats_tickets", sql`${table.ticketsTotal} >= 0`),
  ],
);

export const eventTicketLimits = sqliteTable(
  "event_ticket_limits",
  {
    eventId: text("event_id").primaryKey(),
    currency: text("currency").notNull().default("CAD"),
    maxTicketsPerRegistration: integer("max_tickets_per_registration"),
    maxTotalTickets: integer("max_total_tickets"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    check("event_ticket_limits_currency", sql`length(${table.currency}) = 3`),
    check(
      "event_ticket_limits_max_registration",
      sql`${table.maxTicketsPerRegistration} IS NULL OR ${table.maxTicketsPerRegistration} >= 0`,
    ),
    check(
      "event_ticket_limits_max_total",
      sql`${table.maxTotalTickets} IS NULL OR ${table.maxTotalTickets} >= 0`,
    ),
  ],
);

export const eventTicketTypes = sqliteTable(
  "event_ticket_types",
  {
    eventId: text("event_id").notNull(),
    key: text("key").notNull(),
    labelJson: localizedText("label_json").notNull(),
    descriptionJson: localizedText("description_json"),
    priceMinor: integer("price_minor").notNull().default(0),
    minPerRegistration: integer("min_per_registration").notNull().default(0),
    maxPerRegistration: integer("max_per_registration"),
    defaultQuantity: integer("default_quantity").notNull().default(0),
    capacity: integer("capacity"),
    active: integer("active", { mode: "boolean" })
      .notNull()
      .default(sql`1`),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.key] }),
    foreignKey({ columns: [table.eventId], foreignColumns: [eventTicketLimits.eventId] }).onDelete(
      "restrict",
    ),
    index("event_ticket_types_active").on(table.eventId, table.active, table.sortOrder),
    check(
      "event_ticket_types_label_json",
      sql`json_valid(${table.labelJson}) AND json_type(${table.labelJson}) = 'object' AND length(${table.labelJson}) <= 4096`,
    ),
    check(
      "event_ticket_types_description_json",
      sql`${table.descriptionJson} IS NULL OR (json_valid(${table.descriptionJson}) AND json_type(${table.descriptionJson}) = 'object' AND length(${table.descriptionJson}) <= 8192)`,
    ),
    check(
      "event_ticket_types_key",
      sql`length(${table.key}) BETWEEN 1 AND 64 AND ${table.key} GLOB '[a-z]*' AND ${table.key} NOT GLOB '*[^a-z0-9_]*'`,
    ),
    check("event_ticket_types_price", sql`${table.priceMinor} >= 0`),
    check("event_ticket_types_min", sql`${table.minPerRegistration} >= 0`),
    check(
      "event_ticket_types_max",
      sql`${table.maxPerRegistration} IS NULL OR ${table.maxPerRegistration} >= 0`,
    ),
    check("event_ticket_types_default", sql`${table.defaultQuantity} >= 0`),
    check("event_ticket_types_capacity", sql`${table.capacity} IS NULL OR ${table.capacity} >= 0`),
    check("event_ticket_types_active_check", sql`${table.active} IN (0, 1)`),
    check(
      "event_ticket_types_max_min",
      sql`${table.maxPerRegistration} IS NULL OR ${table.maxPerRegistration} >= ${table.minPerRegistration}`,
    ),
    check(
      "event_ticket_types_default_min",
      sql`${table.defaultQuantity} >= ${table.minPerRegistration}`,
    ),
    check(
      "event_ticket_types_default_max",
      sql`${table.maxPerRegistration} IS NULL OR ${table.defaultQuantity} <= ${table.maxPerRegistration}`,
    ),
  ],
);

export const ticketTypeStats = sqliteTable(
  "ticket_type_stats",
  {
    eventId: text("event_id").notNull(),
    ticketTypeKey: text("ticket_type_key").notNull(),
    ticketsSold: integer("tickets_sold").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.ticketTypeKey] }),
    foreignKey({
      columns: [table.eventId, table.ticketTypeKey],
      foreignColumns: [eventTicketTypes.eventId, eventTicketTypes.key],
    }).onDelete("restrict"),
    check("ticket_type_stats_sold", sql`${table.ticketsSold} >= 0`),
  ],
);

export const eventFormVersions = sqliteTable(
  "event_form_versions",
  {
    eventId: text("event_id").notNull(),
    version: integer("version").notNull(),
    schemaJson: text("schema_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<FormVersionStatus>().notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at"),
    publishedAt: text("published_at"),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.version] }),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    uniqueIndex("event_form_versions_published")
      .on(table.eventId)
      .where(sql`${table.status} = 'published'`),
    index("event_form_versions_event_status").on(table.eventId, table.status, table.version),
    check(
      "event_form_versions_schema_json",
      sql`json_valid(${table.schemaJson}) AND json_type(${table.schemaJson}) = 'object' AND length(${table.schemaJson}) <= 65536`,
    ),
    check("event_form_versions_version", sql`${table.version} > 0`),
    check("event_form_versions_status", sql`${table.status} IN ('draft', 'published', 'archived')`),
  ],
);

export const registrations = sqliteTable(
  "registrations",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    formVersion: integer("form_version"),
    fullName: text("full_name").notNull(),
    fullNameNormalized: text("full_name_normalized").notNull(),
    consentAt: text("consent_at").notNull(),
    confirmationEmailSentAt: text("confirmation_email_sent_at"),
    paymentConfirmationEmailSentAt: text("payment_confirmation_email_sent_at"),
    metadataJson: text("metadata_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.eventId, table.formVersion],
      foreignColumns: [eventFormVersions.eventId, eventFormVersions.version],
    }),
    uniqueIndex("registrations_id_event_unique").on(table.id, table.eventId),
    uniqueIndex("registrations_id_event_form_version_unique").on(
      table.id,
      table.eventId,
      table.formVersion,
    ),
    index("registrations_event_created_at").on(table.eventId, table.createdAt, table.id),
    check(
      "registrations_metadata_json",
      sql`json_valid(${table.metadataJson}) AND json_type(${table.metadataJson}) = 'object' AND length(${table.metadataJson}) <= 16384`,
    ),
  ],
);

export const registrationContacts = sqliteTable(
  "registration_contacts",
  {
    id: text("id").primaryKey(),
    registrationId: text("registration_id").notNull(),
    eventId: text("event_id").notNull(),
    kind: text("kind").notNull(),
    label: text("label"),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(sql`0`),
    isConfirmationMethod: integer("is_confirmation_method", { mode: "boolean" })
      .notNull()
      .default(sql`0`),
    emailAddress: text("email_address"),
    emailNormalized: text("email_normalized"),
    phoneNumber: text("phone_number"),
    phoneNormalized: text("phone_normalized"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    province: text("province"),
    postalCode: text("postal_code"),
    country: text("country"),
    valueJson: text("value_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.registrationId, table.eventId],
      foreignColumns: [registrations.id, registrations.eventId],
    }).onDelete("cascade"),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    index("registration_contacts_registration").on(table.registrationId, table.kind),
    uniqueIndex("registration_contacts_one_primary")
      .on(table.registrationId)
      .where(sql`${table.isPrimary} = 1`),
    uniqueIndex("registration_contacts_one_confirmation")
      .on(table.registrationId)
      .where(sql`${table.isConfirmationMethod} = 1`),
    uniqueIndex("registration_contacts_one_mail")
      .on(table.registrationId)
      .where(sql`${table.kind} = 'mail'`),
    uniqueIndex("registration_contacts_event_email")
      .on(table.eventId, table.emailNormalized)
      .where(sql`${table.kind} = 'email' AND ${table.emailNormalized} IS NOT NULL`),
    uniqueIndex("registration_contacts_registration_phone")
      .on(table.registrationId, table.phoneNormalized)
      .where(sql`${table.kind} = 'phone' AND ${table.phoneNormalized} IS NOT NULL`),
    index("registration_contacts_event_phone")
      .on(table.eventId, table.phoneNormalized)
      .where(sql`${table.kind} = 'phone' AND ${table.phoneNormalized} IS NOT NULL`),
    index("registration_contacts_event_postal")
      .on(table.eventId, table.postalCode)
      .where(sql`${table.kind} = 'mail'`),
    check("registration_contacts_kind", sql`${table.kind} IN ('email', 'phone', 'mail')`),
    check("registration_contacts_primary", sql`${table.isPrimary} IN (0, 1)`),
    check("registration_contacts_confirmation", sql`${table.isConfirmationMethod} IN (0, 1)`),
    check(
      "registration_contacts_country",
      sql`${table.country} IS NULL OR length(${table.country}) = 2`,
    ),
    check(
      "registration_contacts_value_json",
      sql`json_valid(${table.valueJson}) AND json_type(${table.valueJson}) = 'object' AND length(${table.valueJson}) <= 4096`,
    ),
    check(
      "registration_contacts_shape",
      sql`(
        ${table.kind} = 'email'
        AND ${table.emailAddress} IS NOT NULL
        AND ${table.emailNormalized} IS NOT NULL
        AND ${table.phoneNumber} IS NULL
        AND ${table.phoneNormalized} IS NULL
        AND ${table.addressLine1} IS NULL
        AND ${table.addressLine2} IS NULL
        AND ${table.city} IS NULL
        AND ${table.province} IS NULL
        AND ${table.postalCode} IS NULL
        AND ${table.country} IS NULL
      ) OR (
        ${table.kind} = 'phone'
        AND ${table.phoneNumber} IS NOT NULL
        AND ${table.phoneNormalized} IS NOT NULL
        AND ${table.emailAddress} IS NULL
        AND ${table.emailNormalized} IS NULL
        AND ${table.addressLine1} IS NULL
        AND ${table.addressLine2} IS NULL
        AND ${table.city} IS NULL
        AND ${table.province} IS NULL
        AND ${table.postalCode} IS NULL
        AND ${table.country} IS NULL
      ) OR (
        ${table.kind} = 'mail'
        AND ${table.addressLine1} IS NOT NULL
        AND ${table.city} IS NOT NULL
        AND ${table.province} IS NOT NULL
        AND ${table.postalCode} IS NOT NULL
        AND ${table.country} IS NOT NULL
        AND ${table.emailAddress} IS NULL
        AND ${table.emailNormalized} IS NULL
        AND ${table.phoneNumber} IS NULL
        AND ${table.phoneNormalized} IS NULL
      )`,
    ),
  ],
);

export const registrationPhoneClaims = sqliteTable(
  "registration_phone_claims",
  {
    registrationId: text("registration_id").notNull(),
    eventId: text("event_id").notNull(),
    phoneNormalized: text("phone_normalized").notNull(),
    fullNameNormalized: text("full_name_normalized").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.registrationId, table.phoneNormalized] }),
    uniqueIndex("registration_phone_claims_identity").on(
      table.eventId,
      table.phoneNormalized,
      table.fullNameNormalized,
    ),
    foreignKey({ columns: [table.registrationId], foreignColumns: [registrations.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
  ],
);

export const registrationTickets = sqliteTable(
  "registration_tickets",
  {
    registrationId: text("registration_id").notNull(),
    eventId: text("event_id").notNull(),
    ticketTypeKey: text("ticket_type_key").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    currency: text("currency").notNull(),
    labelSnapshotJson: localizedText("label_snapshot_json").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.registrationId, table.ticketTypeKey] }),
    foreignKey({
      columns: [table.registrationId, table.eventId],
      foreignColumns: [registrations.id, registrations.eventId],
    }).onDelete("cascade"),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    foreignKey({
      columns: [table.eventId, table.ticketTypeKey],
      foreignColumns: [eventTicketTypes.eventId, eventTicketTypes.key],
    }).onDelete("restrict"),
    index("registration_tickets_event_type").on(table.eventId, table.ticketTypeKey),
    check(
      "registration_tickets_label_json",
      sql`json_valid(${table.labelSnapshotJson}) AND json_type(${table.labelSnapshotJson}) = 'object' AND length(${table.labelSnapshotJson}) <= 4096`,
    ),
    check("registration_tickets_quantity", sql`${table.quantity} > 0`),
    check("registration_tickets_price", sql`${table.unitPriceMinor} >= 0`),
  ],
);

export const registrationFieldValues = sqliteTable(
  "registration_field_values",
  {
    registrationId: text("registration_id").notNull(),
    eventId: text("event_id").notNull(),
    fieldKey: text("field_key").notNull(),
    formVersion: integer("form_version").notNull(),
    valueJson: text("value_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.registrationId, table.fieldKey] }),
    foreignKey({
      columns: [table.registrationId, table.eventId, table.formVersion],
      foreignColumns: [registrations.id, registrations.eventId, registrations.formVersion],
    }).onDelete("cascade"),
    index("registration_field_values_event_field").on(table.eventId, table.fieldKey),
    index("registration_field_values_event_value").on(
      table.eventId,
      table.fieldKey,
      table.valueJson,
    ),
    check(
      "registration_field_values_json",
      sql`json_valid(${table.valueJson}) AND length(${table.valueJson}) <= 4096`,
    ),
  ],
);

export const registrationFailures = sqliteTable(
  "registration_failures",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    reason: text("reason").notNull(),
    emailAddress: text("email_address"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    index("registration_failures_event_created_at").on(table.eventId, table.createdAt),
    check(
      "registration_failures_reason",
      sql`${table.reason} IN ('ticket_limit_reached', 'ticket_type_capacity_reached', 'event_capacity_reached', 'processing_failed', 'duplicate_registration')`,
    ),
  ],
);

export const checkins = sqliteTable(
  "checkins",
  {
    id: text("id").primaryKey(),
    registrationId: text("registration_id").notNull(),
    checkedInAt: timestamp("checked_in_at"),
  },
  (table) => [
    uniqueIndex("checkins_registration_unique").on(table.registrationId),
    foreignKey({ columns: [table.registrationId], foreignColumns: [registrations.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    registrationId: text("registration_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    confirmedBy: text("confirmed_by"),
    note: text("note"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("payments_registration_unique").on(table.registrationId),
    foreignKey({ columns: [table.registrationId], foreignColumns: [registrations.id] }).onDelete(
      "cascade",
    ),
    check("payments_amount", sql`${table.amountMinor} >= 0`),
    check("payments_method", sql`${table.method} IN ('cash', 'etransfer')`),
  ],
);

export const registrationStatusOtps = sqliteTable(
  "registration_status_otps",
  {
    id: text("id").primaryKey(),
    registrationId: text("registration_id").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    foreignKey({ columns: [table.registrationId], foreignColumns: [registrations.id] }).onDelete(
      "cascade",
    ),
    index("registration_status_otps_registration").on(table.registrationId, table.createdAt),
    check("registration_status_otps_attempts", sql`${table.attempts} >= 0`),
  ],
);

export const registrationStatusSessions = sqliteTable(
  "registration_status_sessions",
  {
    id: text("id").primaryKey(),
    registrationId: text("registration_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    foreignKey({ columns: [table.registrationId], foreignColumns: [registrations.id] }).onDelete(
      "cascade",
    ),
    uniqueIndex("registration_status_sessions_token").on(table.tokenHash),
    index("registration_status_sessions_registration").on(table.registrationId),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    index("audit_events_event_created_at").on(table.eventId, table.createdAt),
    index("audit_events_event_target").on(table.eventId, table.targetId),
    check("audit_events_metadata", sql`${table.metadata} IS NULL OR json_valid(${table.metadata})`),
  ],
);

export const emailDeliveries = sqliteTable(
  "email_deliveries",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    jobType: text("job_type").notNull(),
    status: text("status").notNull().default("processing"),
    attempts: integer("attempts").notNull().default(1),
    lastError: text("last_error"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("email_deliveries_status_updated_at").on(table.status, table.updatedAt),
    check("email_deliveries_status", sql`${table.status} IN ('processing', 'sent', 'failed')`),
  ],
);

export const eventsRelations = relations(events, ({ many, one }) => ({
  aliases: many(eventAliases),
  stats: one(registrationStats, {
    fields: [events.id],
    references: [registrationStats.eventId],
  }),
  limits: one(eventTicketLimits, {
    fields: [events.id],
    references: [eventTicketLimits.eventId],
  }),
  ticketTypes: many(eventTicketTypes),
}));

export const eventAliasesRelations = relations(eventAliases, ({ one }) => ({
  event: one(events, { fields: [eventAliases.eventId], references: [events.id] }),
}));

export const eventTicketTypesRelations = relations(eventTicketTypes, ({ one }) => ({
  event: one(events, { fields: [eventTicketTypes.eventId], references: [events.id] }),
  stats: one(ticketTypeStats, {
    fields: [eventTicketTypes.eventId, eventTicketTypes.key],
    references: [ticketTypeStats.eventId, ticketTypeStats.ticketTypeKey],
  }),
}));

export const registrationsRelations = relations(registrations, ({ many, one }) => ({
  contacts: many(registrationContacts),
  tickets: many(registrationTickets),
  answers: many(registrationFieldValues),
  payment: one(payments, {
    fields: [registrations.id],
    references: [payments.registrationId],
  }),
  checkin: one(checkins, {
    fields: [registrations.id],
    references: [checkins.registrationId],
  }),
}));

export const registrationContactsRelations = relations(registrationContacts, ({ one }) => ({
  registration: one(registrations, {
    fields: [registrationContacts.registrationId],
    references: [registrations.id],
  }),
}));

export const registrationTicketsRelations = relations(registrationTickets, ({ one }) => ({
  registration: one(registrations, {
    fields: [registrationTickets.registrationId],
    references: [registrations.id],
  }),
}));

export const registrationFieldValuesRelations = relations(registrationFieldValues, ({ one }) => ({
  registration: one(registrations, {
    fields: [registrationFieldValues.registrationId],
    references: [registrations.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  registration: one(registrations, {
    fields: [payments.registrationId],
    references: [registrations.id],
  }),
}));

export const checkinsRelations = relations(checkins, ({ one }) => ({
  registration: one(registrations, {
    fields: [checkins.registrationId],
    references: [registrations.id],
  }),
}));
