import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/platform/server/db/app/schemas/**/*.ts",
  out: "./drizzle/app",
});
