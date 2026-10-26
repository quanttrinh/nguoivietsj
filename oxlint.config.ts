import { defineConfig } from "oxlint";

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
  },
  plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y"],
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
    // --- Type-aware rules that conflict with the codebase's conventions ----
    // Requires every parameter to be deeply readonly; too invasive for DOM,
    // Response, and third-party types that cannot be made readonly.
    "typescript/prefer-readonly-parameter-types": "off",
    // Conflicts with `eslint/require-await`.
    // Promise-returning helpers that forward a result are intentionally non-async.
    "typescript/promise-function-async": "off",
    // Values crossing Wrangler/D1/JSON boundaries are typed more optimistically.
    // Their runtime shape is looser, so defensive nullish checks are intentional.
    "typescript/no-unnecessary-condition": "off",
    // Truthiness checks for nullable strings, numbers, and booleans are idiomatic.
    // They avoid `=== true` / `=== false` noise.
    "typescript/strict-boolean-expressions": "off",
    // DOM/custom-element access and validated JSON helpers need narrowing casts.
    // The remaining type-aware rules cover unsafe usage.
    "typescript/no-unsafe-type-assertion": "off",

    // --- Rules that conflict with the codebase's conventions --------------
    // Object key order is meaningful in CSS objects, payloads, and configs.
    "eslint/sort-keys": "off",
    // `null` is used deliberately for absent D1 columns.
    "eslint/no-undefined": "off",
    "unicorn/no-null": "off",
    // Optional chaining, spread, and async/await are idiomatic TypeScript.
    "oxc/no-optional-chaining": "off",
    "oxc/no-rest-spread-properties": "off",
    "oxc/no-async-await": "off",
    // Ternaries keep conditional expressions compact.
    "eslint/no-ternary": "off",
    // Multiple declarations and arrow/function mix are intentional.
    "eslint/one-var": "off",
    "eslint/func-style": "off",
    // UI sizes, ticket limits, and the mask width are clear in context.
    "eslint/no-magic-numbers": "off",
    // API handlers log unexpected failures before returning a generic error.
    "eslint/no-console": "off",
    // `void` marks an intentionally unawaited promise.
    "eslint/no-void": "off",
    // Import ordering is owned by oxfmt.
    "eslint/sort-imports": "off",
    // Direct property reads are clearer than forced destructuring here.
    "eslint/prefer-destructuring": "off",
    // Astro component filenames use PascalCase by convention.
    "unicorn/filename-case": "off",
    // Closure helpers in Preact components capture stable module state.
    // Moving them out would require threading setters and props through parameters.
    "unicorn/consistent-function-scoping": "off",

    // --- Preact-specific React rule adjustments ----------------------------
    // Preact uses the automatic JSX runtime; `React` does not need to be in scope.
    "react/react-in-jsx-scope": "off",
    // Preact uses `class` and supports custom element attributes.
    "react/no-unknown-property": "off",
    // Preact components use .tsx, not .jsx.
    "react/jsx-filename-extension": ["error", { extensions: [".tsx"] }],
    // Small stateless helper components intentionally live beside their page.
    "react/no-multi-comp": ["error", { ignoreStateless: true }],
    // UX copy comes from typed props; separators and short labels are literal.
    "react/jsx-no-literals": "off",
    // JSX depth is a layout choice, not a correctness rule.
    "react/jsx-max-depth": "off",
    // QR SVGs are trusted server output; JSON scripts are escaped at render time.
    "react/no-danger": "off",
    // Fast Refresh component-export rules do not apply to Astro islands.
    "react/only-export-components": "off",
    "react/todo": "off",
    // Preact components are function expressions and arrows interchangeably.
    "react/function-component-definition": "off",
    // `role="status"` on existing layout elements is intentional and valid.
    "jsx-a11y/prefer-tag-over-role": "off",

    // --- Configured, not disabled -----------------------------------------
    // TypeBox is a builder API (`Type.String()`, `Value.Errors()`), not a constructor call.
    "eslint/new-cap": "off",
    // Only nullish comparisons may use `==` / `!=`; everything else is strict.
    "eslint/no-eq-null": "off",
    "eslint/eqeqeq": ["error", "smart", { null: "ignore" }],
    "eslint/max-lines": ["warn", { max: 600, skipBlankLines: true, skipComments: true }],
    "eslint/max-lines-per-function": [
      "warn",
      { max: 240, skipBlankLines: true, skipComments: true },
    ],
    "eslint/max-statements": ["error", 80],
    "eslint/complexity": ["error", 60],
    "eslint/id-length": ["error", { min: 1, max: 40 }],
  },
  env: {
    builtin: true,
    browser: true,
    astro: true,
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
      files: ["plugins/**/*.ts", "scripts/**/*.ts"],
      env: { builtin: true, node: true },
    },
    {
      files: ["*.astro"],
      rules: {
        // Astro frontmatter and template expressions are evaluated at build time.
        // Browser globals only apply to the inline <script> blocks.
        "no-undef": "off",
        // Frontmatter is a module body where top-level `return` is valid.
        "unicorn/prefer-module": "off",
        // Astro's useLocale/useIntlayer are framework helpers, not React hooks.
        "react-hooks/rules-of-hooks": "off",
        "react-hooks/exhaustive-deps": "off",
      },
    },
  ],
});
