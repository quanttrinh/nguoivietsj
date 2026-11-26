import { globSync } from "node:fs";

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

const isCi = process.env.CI === "true";

export default defineConfig({
  test: {
    reporters: isCi
      ? [
          "default",
          // Native GitHub annotations on failing tests; the JUnit action below
          // still publishes the full per-test check run.
          ["github-actions", { jobSummary: { enabled: false } }],
          ["junit", { outputFile: "reports/junit.xml" }],
          ["html", { outputDir: "reports/html" }],
        ]
      : ["default"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      // Every API and server-side module is in scope. Paths are relative to
      // the project root (Vitest 5 matching), so each file must be covered.
      include: [
        "src/features/auth/server/**/*.ts",
        "src/platform/app.ts",
        "src/platform/server/api/helpers/**/*.ts",
        "src/platform/api/routes/**/*.ts",
        "src/platform/server/middleware/**/*.ts",
        "src/platform/server/email/**/*.ts",
      ],
      reporter: ["text"],
    },
    watchTriggerPatterns: [
      {
        // The seed fixture is read at runtime, so the import graph misses it.
        // Any integration test may depend on the seeded events, not just the
        // database suite, so widen the trigger target to the whole directory.
        pattern: /src\/platform\/jobs\/backfills\/seed\/seed-events\.json$/u,
        testsToRun: () => globSync("tests/integration/**/*.test.ts"),
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
