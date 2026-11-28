// @boundary server
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Shared email idempotency ledger for every queue job. */
export const emailDeliveries = sqliteTable(
  "email_deliveries",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    jobType: text("job_type").notNull(),
    status: text("status", { enum: ["processing", "sent", "failed"] })
      .notNull()
      .default("processing"),
    attempts: integer("attempts").notNull().default(1),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("email_deliveries_status_updated_at").on(table.status, table.updatedAt),
    check("email_deliveries_status", sql`${table.status} IN ('processing', 'sent', 'failed')`),
  ],
);
