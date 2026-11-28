import { fileURLToPath } from "node:url";

import { defineConfig } from "oxlint";

process.env.PANDA_CONFIG_PATH ??= fileURLToPath(new URL("panda.config.ts", import.meta.url));

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
  },
  plugins: [
    "eslint",
    "import",
    "jsx-a11y",
    "node",
    "oxc",
    "promise",
    "react",
    "typescript",
    "unicorn",
  ],
  jsPlugins: [
    { name: "@pandacss", specifier: "@pandacss/eslint-plugin/oxlint" },
    { name: "boundary", specifier: "./plugins/oxlint-boundary-plugin.ts" },
  ],
  categories: {
    correctness: "error",
    nursery: "error",
    pedantic: "error",
    perf: "error",
    restriction: "error",
    style: "error",
    suspicious: "error",
  },
  rules: {
    // --- Panda CSS ---------------------------------------------------------
    "@pandacss/extraction-diagnostics": "error",
    "@pandacss/file-not-included": "error",
    "@pandacss/no-debug": "error",
    "@pandacss/no-deprecated": "error",
    "@pandacss/no-dynamic-styling": "error",
    "@pandacss/no-invalid-nesting": "error",
    "@pandacss/no-invalid-token-paths": "error",
    "@pandacss/no-descendant-selectors": "error",
    "@pandacss/no-important": "error",
    "@pandacss/no-physical-properties": "error",
    "@pandacss/no-primitive-token": "error",
    "@pandacss/no-shorthand-longhand-mix": "error",
    "@pandacss/prefer-token": ["error", { allow: ["0"] }],
    "@pandacss/consistent-property-style": ["error", { style: "shorthand" }],
    "@pandacss/no-margin-properties": "error",
    "@pandacss/prefer-text-style": "error",
    // --- ESLint ------------------------------------------------------------
    "eslint/class-methods-use-this": ["error", { exceptMethods: ["render"] }],
    "eslint/no-eq-null": "off",
    "eslint/eqeqeq": ["error", "smart"],
    "eslint/no-undefined": "off",
    "eslint/no-ternary": "off",
    "eslint/one-var": "off",
    "eslint/func-style": "off",
    "eslint/init-declarations": "off",
    "eslint/no-magic-numbers": "off",
    "eslint/no-void": "off",
    "eslint/capitalized-comments": ["error", "always", { ignoreConsecutiveComments: true }],
    "eslint/sort-imports": "off",
    "eslint/sort-keys": "off",
    "eslint/prefer-destructuring": "off",
    "eslint/new-cap": [
      "error",
      {
        capIsNewExceptions: [
          "Check",
          "Errors",
          "Format",
          "Integer",
          "Literal",
          "Never",
          "Null",
          "Omit",
          "Optional",
          "Partial",
          "Record",
          "Recursive",
          "TaggedError",
          "Union",
          "Unknown",
        ],
      },
    ],
    "eslint/complexity": ["error", 60],
    "eslint/id-length": [
      "error",
      { min: 2, max: 40, exceptions: ["_", "h", "M"], properties: "never" },
    ],
    "eslint/max-lines": ["warn", { max: 600, skipBlankLines: true, skipComments: true }],
    "eslint/max-lines-per-function": [
      "warn",
      { max: 240, skipBlankLines: true, skipComments: true },
    ],
    "eslint/max-statements": ["error", 80],
    "eslint/require-await": "off",

    // --- Import ------------------------------------------------------------
    "import/exports-last": "off",
    "import/group-exports": "off",
    "import/max-dependencies": "off",
    "import/no-named-export": "off",
    "import/no-relative-parent-imports": "off",
    "import/prefer-default-export": "off",
    "import/consistent-type-specifier-style": "off",
    "typescript/consistent-type-imports": "off",
    "typescript/no-import-type-side-effects": "error",

    // --- oxc ---------------------------------------------------------------
    "oxc/no-async-await": "off",
    "oxc/no-optional-chaining": "off",
    "oxc/no-rest-spread-properties": "off",

    // --- TypeScript --------------------------------------------------------
    "typescript/explicit-function-return-type": "off",
    "typescript/explicit-module-boundary-types": "off",
    "typescript/explicit-member-accessibility": [
      "error",
      {
        accessibility: "no-public",
        overrides: { constructors: "no-public", properties: "no-public" },
      },
    ],
    "typescript/prefer-readonly-parameter-types": "off",
    "typescript/promise-function-async": "off",
    "typescript/require-await": "off",
    "typescript/strict-boolean-expressions": [
      "error",
      {
        allowString: true,
        allowNumber: true,
        allowNullableObject: true,
        allowNullableBoolean: true,
        allowNullableString: true,
        allowNullableNumber: true,
        allowNullableEnum: true,
        allowAny: false,
      },
    ],
    "typescript/no-unsafe-type-assertion": "warn",

    // --- Unicorn -----------------------------------------------------------
    "unicorn/no-null": "off",
    "unicorn/no-useless-undefined": "off",
    "unicorn/filename-case": "off",

    // --- Preact-specific React rule adjustments ----------------------------
    "react/react-in-jsx-scope": "off",
    "react/no-unknown-property": "off",
    "react/jsx-filename-extension": ["error", { extensions: [".tsx"] }],
    "react/jsx-props-no-spreading": "off",
    "react/no-multi-comp": ["error", { ignoreStateless: true }],
    "react/jsx-no-literals": "off",
    "react/jsx-max-depth": ["error", { max: 8 }],
    "react/no-danger": "off",
    "react/only-export-components": "off",
    "react/todo": "off",
    "react/function-component-definition": "off",
    "jsx-a11y/prefer-tag-over-role": "off",
  },
  env: {
    builtin: true,
    "shared-node-browser": true,
  },
  globals: {
    __WORKER_ORIGIN__: "readonly",
  },
  ignorePatterns: [
    "worker-configuration.d.ts",
    "dist/",
    "styled-system/",
    ".astro/",
    ".wrangler/",
    "node_modules/",
    "src/generated/",
    ".vitest/",
    "coverage/",
    "reports/",
    "test-results/",
    "playwright-report/",
  ],
  overrides: [
    {
      files: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.astro"],
      rules: {
        "boundary/scopes": [
          "error",
          {
            exempt: ["src/types/worker-configuration.d.ts"],
            importExempt: ["src/types/api.d.ts"],
            allowedServerTypes: ["src/types/api"],
          },
        ],
      },
    },
    {
      files: [
        "*.config.ts",
        "src/platform/jobs/backfills/**/*.ts",
        "plugins/**/*.ts",
        "scripts/**/*.ts",
        "src/platform/jobs/tooling/**/*.ts",
        "manage.ts",
        "tests/**/*.ts",
      ],
      env: { builtin: true, node: true, serviceworker: true },
      rules: {
        "import/no-nodejs-modules": "off",
        "node/no-sync": "off",
        "node/no-process-env": "off",
        "node/no-top-level-await": "off",
        "eslint/no-console": "off",
        "import/no-default-export": "off",
        "import/no-named-as-default": "off",
        "import/no-named-as-default-member": "off",
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
      },
    },
    {
      files: ["**/*.tsx", "src/**/ui/**/*.ts", "src/**/client/**/*.ts"],
      env: { builtin: true, browser: true, astro: true },
      rules: {
        "import/no-default-export": "off",
      },
    },
    {
      files: ["src/worker.ts"],
      rules: {
        "import/no-default-export": "off",
      },
    },
    {
      files: ["*.astro"],
      env: { builtin: true, browser: true, astro: true },
      rules: {
        "no-undef": "off",
        "import/no-unassigned-import": "off",
        "unicorn/prefer-module": "off",
        "import/unambiguous": "off",
        "node/no-top-level-await": "off",
        "@pandacss/extraction-diagnostics": "off",
        "react-hooks/rules-of-hooks": "off",
        "react-hooks/exhaustive-deps": "off",
      },
    },
    {
      files: ["**/*.d.ts"],
      rules: {
        "import/no-unassigned-import": "off",
        "import/unambiguous": "off",
      },
    },
    {
      files: [
        "src/**/server/**/*.ts",
        "src/platform/app.ts",
        "src/platform/server/api/helpers/**/*.ts",
        "src/features/*/server/api/**/*.ts",
        "src/platform/i18n/**/*.ts",
        "src/platform/server/middleware/**/*.ts",
        "src/platform/server/email/**/*.ts",
        "src/features/events/server/services/**/*.ts",
        "src/platform/server/db/**/*.ts",
        "src/worker.ts",
      ],
      env: { builtin: true, node: true, serviceworker: true },
      rules: {
        "import/no-nodejs-modules": "off",
        "eslint/no-console": "off",
      },
    },
    {
      files: ["src/platform/server/db/app/schemas/auth-schema.ts"],
      rules: {
        "boundary/scopes": "off",
        "eslint/id-length": "off",
        "eslint/no-inline-comments": "off",
      },
    },
  ],
});
