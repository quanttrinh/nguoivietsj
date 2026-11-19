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
          ["junit", { outputFile: "reports/junit.xml" }],
          ["html", { outputDir: "reports/html" }],
        ]
      : ["default"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      // Core API surface covered first; admin routes join after their tests.
      include: [
        "src/auth/server/middleware.ts",
        "src/server/api-response.ts",
        "src/server/app.ts",
        "src/server/common-responses.ts",
        "src/server/middleware/**/*.ts",
        "src/server/root.ts",
        "src/server/routes/events/public.ts",
        "src/server/routes/events/registration-errors.ts",
        "src/server/routes/events/status.ts",
        "src/server/routes/health.ts",
        "src/server/validation-handler.ts",
      ],
      reporter: ["text"],
      thresholds: {
        branches: 95,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
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
