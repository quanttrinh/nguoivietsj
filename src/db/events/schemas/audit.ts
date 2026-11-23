// @boundary server
import { sql } from "drizzle-orm";
import { check, foreignKey, index, text } from "drizzle-orm/sqlite-core";

import { events } from "./events";
import { defineTable, timestamp } from "./shared";

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
