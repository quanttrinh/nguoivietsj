import { fileURLToPath } from "node:url";

import { defineConfig } from "oxlint";

// The Panda oxlint plugin loads the design system from this path so the rules
// can validate every `css()` call against the real token table.
process.env.PANDA_CONFIG_PATH ??= fileURLToPath(new URL("panda.config.ts", import.meta.url));

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
  },
  // Same plugin set and rule categories as the `qui` design system.
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
    // Catch styles the compiler silently drops or renders without theme tokens.
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
    // Render methods stay `this`-free in Preact class components.
    "eslint/class-methods-use-this": ["error", { exceptMethods: ["render"] }],
    // Only nullish comparisons may use `==` / `!=`; everything else is strict.
    "eslint/no-eq-null": "off",
    "eslint/eqeqeq": ["error", "smart"],
    // Undefined marks an absent D1 column or optional payload field on purpose.
    "eslint/no-undefined": "off",
    // Ternaries keep conditional expressions compact.
    "eslint/no-ternary": "off",
    // Multiple declarations and arrow/function mixes are intentional.
    "eslint/one-var": "off",
    "eslint/func-style": "off",
    "eslint/init-declarations": "off",
    // UI sizes, ticket limits, and mask widths are clear in context.
    "eslint/no-magic-numbers": "off",
    // Void marks an intentionally unawaited promise.
    "eslint/no-void": "off",
    // Wrapped comment blocks only need the opening line capitalized.
    "eslint/capitalized-comments": ["error", "always", { ignoreConsecutiveComments: true }],
    // Import ordering is owned by oxfmt.
    "eslint/sort-imports": "off",
    // Object key order is meaningful in CSS objects, payloads, and configs.
    "eslint/sort-keys": "off",
    // Direct property reads are clearer than forced destructuring here.
    "eslint/prefer-destructuring": "off",
    // TypeBox, TypeSystem, and Effect expose builder functions, not
    // constructors, so they join the exception list the library uses for its
    // Stencil decorators.
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
    // Size and complexity budgets for Astro islands, API handlers, and D1 rows.
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

    // --- Import ------------------------------------------------------------
    // Named exports and relative parent imports connect feature folders to shared code.
    "import/exports-last": "off",
    "import/group-exports": "off",
    "import/max-dependencies": ["error", { max: 20 }],
    "import/no-named-export": "off",
    "import/no-relative-parent-imports": "off",
    "import/prefer-default-export": "off",
    // Prefer top-level `import type` so TypeScript erases the whole statement
    // under `verbatimModuleSyntax`. Inline type specifiers keep the statement as
    // a side-effect import, which defeats tree-shaking for modules that run
    // ArkType at load time.
    "import/consistent-type-specifier-style": "off",
    "typescript/consistent-type-imports": "off",
    "typescript/no-import-type-side-effects": "error",

    // --- oxc ---------------------------------------------------------------
    // These restrictions predate optional chaining and object spread.
    "oxc/no-async-await": "off",
    "oxc/no-optional-chaining": "off",
    "oxc/no-rest-spread-properties": "off",

    // --- TypeScript --------------------------------------------------------
    // Match the library: annotate returned values, keep class members implicit.
    "typescript/explicit-function-return-type": [
      "error",
      {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowConciseArrowFunctionExpressionsStartingWithVoid: true,
      },
    ],
    "typescript/explicit-member-accessibility": [
      "error",
      {
        accessibility: "no-public",
        overrides: { constructors: "no-public", properties: "no-public" },
      },
    ],
    // Deep-readonly parameters are too invasive for DOM, Response, and D1 types.
    "typescript/prefer-readonly-parameter-types": "off",
    // Forwarding helpers stay non-async on purpose. oxlint's `require-await` has no
    // options, so enabling this rule would force `async` onto every function that
    // returns a promise, which `require-await` then rejects — and `return await` is
    // rejected by `typescript/return-await`. The only rules-compatible rewrite would
    // add needless `await`s, so the app keeps explicit `Promise<T>` returns.
    "typescript/promise-function-async": "off",
    // Library parity with permissive options: nullable truthiness is allowed,
    // `any` and always-truthy objects are not.
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
    // Advisory: DOM and custom-element access often needs a narrowing cast.
    "typescript/no-unsafe-type-assertion": "warn",

    // --- Unicorn -----------------------------------------------------------
    // Null is required by DOM APIs and marks absent D1 columns.
    "unicorn/no-null": "off",
    // Explicit undefined is the clearest way to signal an absent value.
    "unicorn/no-useless-undefined": "off",
    // Astro component filenames use PascalCase by convention.
    "unicorn/filename-case": "off",

    // --- Preact-specific React rule adjustments ----------------------------
    // Preact uses the automatic JSX runtime, so `React` need not be in scope.
    "react/react-in-jsx-scope": "off",
    // Preact uses `class` and supports custom element attributes.
    "react/no-unknown-property": "off",
    // Preact components use .tsx, not .jsx.
    "react/jsx-filename-extension": ["error", { extensions: [".tsx"] }],
    // Form controls spread precomputed Qui props and state attributes, as in the
    // library's own package config.
    "react/jsx-props-no-spreading": "off",
    // Small stateless helper components intentionally live beside their page.
    "react/no-multi-comp": ["error", { ignoreStateless: true }],
    // UX copy comes from typed props; separators and short labels are literal.
    "react/jsx-no-literals": "off",
    // Same ceiling as the library's components.
    "react/jsx-max-depth": ["error", { max: 8 }],
    // QR SVGs are trusted server output; JSON scripts are escaped at render time.
    "react/no-danger": "off",
    // Fast Refresh component-export rules do not apply to Astro islands.
    "react/only-export-components": "off",
    "react/todo": "off",
    // Preact components are function expressions and arrows interchangeably.
    "react/function-component-definition": "off",
    // Role="status" on existing layout elements is intentional and valid.
    "jsx-a11y/prefer-tag-over-role": "off",
  },
  env: {
    builtin: true,
    "shared-node-browser": true,
  },
  globals: {
    __BETTER_AUTH_BASE_URL_CONFIG__: "readonly",
  },
  ignorePatterns: [
    ".intlayer/",
    "worker-configuration.d.ts",
    "dist/",
    "styled-system/",
    ".astro/",
    ".wrangler/",
    "node_modules/",
  ],
  overrides: [
    {
      // Client/server import boundaries for every source file under `src/`.
      files: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.astro"],
      rules: {
        "boundary/scopes": [
          "error",
          {
            serverSegments: ["server", "db", "services", "backfills", "tooling"],
            clientSegments: ["ui", "client"],
            astroSegments: ["pages", "layouts"],
            exempt: ["src/types/worker-configuration.d.ts"],
            importExempt: ["src/types/api.d.ts"],
            allowedServerTypes: ["src/types/api"],
          },
        ],
      },
    },
    {
      // Build-time Node code: Astro integrations, tooling scripts, configs, tests.
      files: [
        "*.config.ts",
        "src/backfills/**/*.ts",
        "plugins/**/*.ts",
        "scripts/**/*.ts",
        "src/tooling/**/*.ts",
        "manage.ts",
        "tests/**/*.ts",
      ],
      env: { builtin: true, node: true, serviceworker: true },
      rules: {
        // These modules run in Node: they read files, spawn CLIs, and hash paths.
        "import/no-nodejs-modules": "off",
        // A CLI and its config readers are simpler synchronous than concurrent.
        "node/no-sync": "off",
        // The CLI resolves its environment and wrangler config from process.env.
        "node/no-process-env": "off",
        // A one-shot CLI entry point can await at the top level.
        "node/no-top-level-await": "off",
        // A CLI prints to stdout/stderr: that is its user interface.
        "eslint/no-console": "off",
        // Bundler plugins and defineConfig modules export a default by contract.
        "import/no-default-export": "off",
        "import/no-named-as-default": "off",
        "import/no-named-as-default-member": "off",
      },
    },
    {
      // Browser and UI code: Preact islands, UI helpers, and client modules.
      files: ["**/*.tsx", "src/**/ui/**/*.ts", "src/**/client/**/*.ts"],
      env: { builtin: true, browser: true, astro: true },
      rules: {
        "import/no-default-export": "off",
      },
    },
    {
      // Intlayer dictionaries default-export by framework convention.
      files: ["**/*.content.ts"],
      rules: {
        "import/no-default-export": "off",
      },
    },
    {
      files: ["src/worker.ts"],
      rules: {
        // The Cloudflare entrypoint exports its handlers as the module default.
        "import/no-default-export": "off",
      },
    },
    {
      files: ["*.astro"],
      env: { builtin: true, browser: true, astro: true },
      rules: {
        // Astro frontmatter runs at build time; browser globals apply to scripts.
        "no-undef": "off",
        // `virtual:qui/register` is a side-effect import by design.
        "import/no-unassigned-import": "off",
        // Frontmatter is a module body where top-level `return` is valid.
        "unicorn/prefer-module": "off",
        // Frontmatter declares no imports of its own; Astro compiles it to a module.
        "import/unambiguous": "off",
        // Data loaders await their sources at the top level by design.
        "node/no-top-level-await": "off",
        // Panda's static extractor parses `.astro` frontmatter as JavaScript, so
        // any `Props` interface or return annotation trips it (verified: dropping
        // one annotation silences the pair of diagnostics). The Vite transform
        // pipeline is SFC-aware and emits these styles regardless — `.astro`-only
        // utilities such as `max-w_8xl` ship in the built CSS — so this is a
        // tooling limitation, not a style gap. `.ts`/`.tsx` stay covered.
        "@pandacss/extraction-diagnostics": "off",
        // Astro's useLocale/useIntlayer are framework helpers, not React hooks.
        "react-hooks/rules-of-hooks": "off",
        "react-hooks/exhaustive-deps": "off",
      },
    },
    {
      // Generated Preact JSX declarations are side-effect imports by design.
      files: ["**/*.d.ts"],
      rules: {
        "import/no-unassigned-import": "off",
      },
    },
    {
      // Server-side entrypoints log through the Worker runtime, where stdout is
      // the log sink; the browser path goes through `reportClientError` instead.
      files: [
        "src/**/server/**/*.ts",
        "src/events/services/**/*.ts",
        "src/db/**/*.ts",
        "src/worker.ts",
        "src/middleware.ts",
      ],
      env: { builtin: true, node: true, serviceworker: true },
      rules: {
        // Server code runs with the Worker's Node compatibility enabled.
        "import/no-nodejs-modules": "off",
        "eslint/no-console": "off",
      },
    },
    {
      files: ["**/*.d.ts"],
      rules: {
        // Ambient declaration files are scripts by design.
        "import/unambiguous": "off",
      },
    },
  ],
});
