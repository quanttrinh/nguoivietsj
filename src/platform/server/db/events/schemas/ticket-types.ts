// @boundary server
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, text } from "drizzle-orm/sqlite-core";

import { events } from "./events";
import { defineTable, localizedText, timestamp, updatedTimestamp } from "./shared";

export const eventTicketLimits = defineTable(
  "event_ticket_limits",
  {
    eventId: text().primaryKey(),
    currency: text().notNull().default("CAD"),
    maxTicketsPerRegistration: integer(),
    maxTotalTickets: integer(),
    createdAt: timestamp(),
    updatedAt: updatedTimestamp(),
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

export const eventTicketTypes = defineTable(
  "event_ticket_types",
  {
    eventId: text().notNull(),
    key: text().notNull(),
    labelJson: localizedText().notNull(),
    descriptionJson: localizedText(),
    priceMinor: integer().notNull().default(0),
    minPerRegistration: integer().notNull().default(0),
    maxPerRegistration: integer(),
    defaultQuantity: integer().notNull().default(0),
    capacity: integer(),
    active: integer({ mode: "boolean" })
      .notNull()
      .default(sql`1`),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp(),
    updatedAt: updatedTimestamp(),
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

export const ticketTypeStats = defineTable(
  "ticket_type_stats",
  {
    eventId: text().notNull(),
    ticketTypeKey: text().notNull(),
    ticketsSold: integer().notNull().default(0),
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
