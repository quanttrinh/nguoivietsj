import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/app/schemas/**/*.ts",
  out: "./drizzle/app",
});
