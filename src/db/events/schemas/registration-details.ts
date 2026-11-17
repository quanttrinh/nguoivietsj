// @boundary server
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { PaymentMethod } from "~/events/domain/types";

import { events } from "./events";
import { registrations } from "./registrations";
import { defineTable, localizedText, timestamp, updatedTimestamp } from "./shared";
import { eventTicketTypes } from "./ticket-types";

export const registrationTickets = defineTable(
  "registration_tickets",
  {
    registrationId: text().notNull(),
    eventId: text().notNull(),
    ticketTypeKey: text().notNull(),
    quantity: integer().notNull(),
    unitPriceMinor: integer().notNull(),
    currency: text().notNull(),
    labelSnapshotJson: localizedText().notNull(),
    createdAt: timestamp(),
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

export const registrationFieldValues = defineTable(
  "registration_field_values",
  {
    registrationId: text().notNull(),
    eventId: text().notNull(),
    fieldKey: text().notNull(),
    formVersion: integer().notNull(),
    valueJson: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp(),
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

export const checkins = defineTable(
  "checkins",
  {
    id: text().primaryKey(),
    eventId: text().notNull(),
    registrationId: text().notNull(),
    checkedInAt: timestamp(),
  },
  (table) => [
    index("checkins_event_checked_in_at").on(table.eventId, table.checkedInAt),
    uniqueIndex("checkins_registration_unique").on(table.registrationId),
    foreignKey({
      columns: [table.registrationId, table.eventId],
      foreignColumns: [registrations.id, registrations.eventId],
    }).onDelete("cascade"),
  ],
);

export const payments = defineTable(
  "payments",
  {
    id: text().primaryKey(),
    eventId: text().notNull(),
    registrationId: text().notNull(),
    amountMinor: integer().notNull(),
    currency: text().notNull(),
    method: text().$type<PaymentMethod>().notNull(),
    confirmedBy: text(),
    note: text(),
    createdAt: timestamp(),
    updatedAt: updatedTimestamp(),
  },
  (table) => [
    index("payments_event_id").on(table.eventId),
    uniqueIndex("payments_registration_unique").on(table.registrationId),
    foreignKey({
      columns: [table.registrationId, table.eventId],
      foreignColumns: [registrations.id, registrations.eventId],
    }).onDelete("cascade"),
    check("payments_amount", sql`${table.amountMinor} >= 0`),
    check("payments_method", sql`${table.method} IN ('cash', 'etransfer', 'other')`),
  ],
);

export const registrationStatusOtps = defineTable(
  "registration_status_otps",
  {
    id: text().primaryKey(),
    registrationId: text().notNull(),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: text().notNull(),
    consumedAt: text(),
    createdAt: timestamp(),
  },
  (table) => [
    foreignKey({ columns: [table.registrationId], foreignColumns: [registrations.id] }).onDelete(
      "cascade",
    ),
    index("registration_status_otps_registration").on(table.registrationId, table.createdAt),
    check("registration_status_otps_attempts", sql`${table.attempts} >= 0`),
  ],
);

export const registrationStatusSessions = defineTable(
  "registration_status_sessions",
  {
    id: text().primaryKey(),
    registrationId: text().notNull(),
    tokenHash: text().notNull(),
    expiresAt: text().notNull(),
    createdAt: timestamp(),
  },
  (table) => [
    foreignKey({ columns: [table.registrationId], foreignColumns: [registrations.id] }).onDelete(
      "cascade",
    ),
    uniqueIndex("registration_status_sessions_token").on(table.tokenHash),
    index("registration_status_sessions_registration").on(table.registrationId),
  ],
);
