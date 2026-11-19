import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** Vite options shared by every project. */
const shared = {
  resolve: { tsconfigPaths: true },
};

/** Preact JSX transform, only needed by component tests. */
const preact = {
  oxc: { jsx: { runtime: "automatic" as const, importSource: "preact" } },
};

export default defineConfig({
  test: {
    restoreMocks: true,
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
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/integration/api/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        ...shared,
        ...preact,
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.tsx"],
          testTimeout: 15_000,
          hookTimeout: 15_000,
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
