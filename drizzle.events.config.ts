import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/events/schemas/**/!(index).ts",
  out: "./drizzle/events",
});
