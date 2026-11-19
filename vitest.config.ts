import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    watchTriggerPatterns: [
      {
        // The seed fixture is read at runtime, so the import graph misses it.
        pattern: /src\/backfills\/seed\/seed-events\.json$/u,
        testsToRun: () => "tests/backfills/seed/schema.test.ts",
      },
    ],
  },
});
