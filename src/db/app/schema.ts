import { sql } from "drizzle-orm";
import { check, customType, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { UserRole } from "~/shared/constants/roles";

/**
 * SQLite stores the collation on the column. Drizzle's built-in text builder
 * does not expose COLLATE, so declare the exact column type here.
 */
const textNocase = customType<{ data: string; driverData: string }>({
  dataType() {
    return "text COLLATE NOCASE";
  },
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: textNocase("email").notNull(),
    role: text("role").$type<UserRole>().notNull().default("staff"),
    createdAt: text("created_at").default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    check("users_role", sql`${table.role} IN ('admin', 'staff')`),
  ],
);
