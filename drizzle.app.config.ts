import { defineConfig } from "drizzle-kit";

/**
 * Codebase-first migrations for the application database.
 *
 * src/db/app/schema.ts owns the users table, including the NOCASE collation on
 * users.email, which is declared with a custom SQLite column type.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/app/schema.ts",
  out: "./drizzle/app",
});
