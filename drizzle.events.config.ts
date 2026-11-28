import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/platform/server/db/events/schemas/**/!(index).ts",
  out: "./drizzle/events",
});
