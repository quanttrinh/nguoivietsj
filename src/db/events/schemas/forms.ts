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

import type { FormVersionStatus } from "~/events/domain/types";

import { events } from "./events";
import { defineTable, timestamp } from "./shared";

export const eventFormVersions = defineTable(
  "event_form_versions",
  {
    eventId: text().notNull(),
    version: integer().notNull(),
    schemaJson: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text().$type<FormVersionStatus>().notNull(),
    createdBy: text(),
    createdAt: timestamp(),
    publishedAt: text(),
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
