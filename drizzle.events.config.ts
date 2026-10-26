import { defineConfig } from "drizzle-kit";

/**
 * Codebase-first migrations for the event engine.
 *
 * src/db/events/schema.ts owns tables, indexes, checks, and foreign keys.
 * Triggers live in generate --custom migrations because Drizzle cannot model
 * them, and table rebuilds must be reviewed before applying to D1.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/events/schema.ts",
  out: "./drizzle/events",
});
