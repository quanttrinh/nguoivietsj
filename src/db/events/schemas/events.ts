// @boundary server
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { EventNotes, EventStatus } from "~/events/domain/types";

import { defineTable, localizedText, timestamp, updatedTimestamp } from "./shared";

export const events = defineTable(
  "events",
  {
    id: text().primaryKey(),
    slug: text().notNull(),
    eventType: text().notNull(),
    editionYear: integer().notNull(),
    defaultLocale: text().notNull().default("en"),
    status: text().$type<EventStatus>().notNull().default("draft"),
    enabled: integer({ mode: "boolean" })
      .notNull()
      .default(sql`0`),
    registrationOpen: integer({ mode: "boolean" })
      .notNull()
      .default(sql`0`),
    startsAt: text(),
    endsAt: text(),
    timezone: text().notNull().default("UTC"),
    titleJson: localizedText().notNull(),
    summaryJson: localizedText().notNull().default({}),
    locationName: text().notNull().default(""),
    locationAddress: text().notNull().default(""),
    locationMapUrl: text(),
    locationMapEmbedUrl: text(),
    paymentEtransferEnabled: integer({ mode: "boolean" })
      .notNull()
      .default(sql`0`),
    paymentEtransferEmail: text(),
    paymentCashEnabled: integer({ mode: "boolean" })
      .notNull()
      .default(sql`0`),
    paymentCashAddress: text(),
    paymentCashMapUrl: text(),
    paymentCashMapEmbedUrl: text(),
    notesJson: text({ mode: "json" }).$type<EventNotes>().notNull().default({}),
    createdAt: timestamp(),
    updatedAt: updatedTimestamp(),
  },
  (table) => [
    uniqueIndex("events_slug_unique").on(table.slug),
    uniqueIndex("events_type_year_unique").on(table.eventType, table.editionYear),
    index("events_created_at").on(table.createdAt, table.id),
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

export const eventAliases = defineTable(
  "event_aliases",
  {
    alias: text().primaryKey(),
    eventId: text().notNull(),
    createdAt: timestamp(),
  },
  (table) => [
    index("event_aliases_event_id").on(table.eventId),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
  ],
);

export const eventSlugClaims = defineTable(
  "event_slug_claims",
  {
    slug: text().primaryKey(),
    eventId: text().notNull(),
  },
  (table) => [
    index("event_slug_claims_event_id").on(table.eventId),
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("cascade"),
  ],
);

export const registrationStats = defineTable(
  "registration_stats",
  {
    eventId: text().primaryKey(),
    registrationCount: integer().notNull().default(0),
    ticketsTotal: integer().notNull().default(0),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    check("registration_stats_count", sql`${table.registrationCount} >= 0`),
    check("registration_stats_tickets", sql`${table.ticketsTotal} >= 0`),
  ],
);
