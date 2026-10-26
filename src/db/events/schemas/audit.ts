// @boundary server
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, text } from "drizzle-orm/sqlite-core";

import { events } from "./events";
import { defineTable, timestamp, updatedTimestamp } from "./shared";

export const auditEvents = defineTable(
  "audit_events",
  {
    id: text().primaryKey(),
    eventId: text().notNull(),
    actorUserId: text().notNull(),
    action: text().notNull(),
    targetId: text(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: timestamp(),
  },
  (table) => [
    foreignKey({ columns: [table.eventId], foreignColumns: [events.id] }).onDelete("restrict"),
    index("audit_events_event_created_at").on(table.eventId, table.createdAt),
    index("audit_events_event_target").on(table.eventId, table.targetId),
    check("audit_events_metadata", sql`${table.metadata} IS NULL OR json_valid(${table.metadata})`),
  ],
);

export const emailDeliveries = defineTable(
  "email_deliveries",
  {
    idempotencyKey: text().primaryKey(),
    jobType: text().notNull(),
    status: text().notNull().default("processing"),
    attempts: integer().notNull().default(1),
    lastError: text(),
    createdAt: timestamp(),
    updatedAt: updatedTimestamp(),
  },
  (table) => [
    index("email_deliveries_status_updated_at").on(table.status, table.updatedAt),
    check("email_deliveries_status", sql`${table.status} IN ('processing', 'sent', 'failed')`),
  ],
);
