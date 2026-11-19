import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const shared = {
  oxc: { jsx: { runtime: "automatic" as const, importSource: "preact" } },
  resolve: { tsconfigPaths: true },
};

export default defineConfig({
  test: {
    watchTriggerPatterns: [
      {
        // The seed fixture is read at runtime, so the import graph misses it.
        pattern: /src\/backfills\/seed\/seed-events\.json$/u,
        testsToRun: () => "tests/integration/database.test.ts",
      },
    ],
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/integration/**", "tests/browser/**"],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        ...shared,
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
