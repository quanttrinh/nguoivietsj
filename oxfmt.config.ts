import { defineConfig } from "oxfmt";

export default defineConfig({
  // Format .astro templates, including frontmatter, with the Rust Astro compiler.
  // This requires @astrojs/compiler-rs at runtime.
  astro: true,
  // Keep the project on one deterministic formatting style.
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  bracketSpacing: true,
  arrowParens: "always",
  // Sort imports into stable groups.
  // Side-effect imports stay in place so registration/stylesheet order is preserved.
  sortImports: {
    internalPattern: ["~/", "@/", "styled-system/"],
    groups: [
      "builtin",
      "external",
      "astro",
      ["internal", "subpath"],
      ["parent", "sibling", "index"],
      "style",
      "unknown",
    ],
    customGroups: [{ groupName: "astro", elementNamePattern: ["astro:**", "virtual:**"] }],
    newlinesBetween: true,
  },
  ignorePatterns: [
    ".intlayer/",
    "dist/",
    "styled-system/",
    ".astro/",
    ".wrangler/",
    ".devcontainer/",
    "node_modules/",
    "worker-configuration.d.ts",
    "bun.lock",
  ],
});
