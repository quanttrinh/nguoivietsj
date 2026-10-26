import { fileURLToPath } from "node:url";

import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import preact from "@astrojs/preact";
import pandacss from "@pandacss/vite";
import Qui from "@quanttrinh/qui-unplugin";
import { intlayer } from "astro-intlayer";
import { defineConfig, envField } from "astro/config";

import { repository } from "./package.json";
import { betterAuthUrl } from "./plugins/better-auth-url";
import { CSP_CONFIG } from "./plugins/csp-astro";
import { modulePreloads } from "./plugins/module-preloads";
import { securityHeadersFile } from "./plugins/security-headers-file";
import { workerRouting } from "./plugins/worker-routing";
import {
  EVENT_PAGE_CACHE_MAX_AGE_SECONDS,
  EVENT_PAGE_CACHE_SWR_SECONDS,
} from "./src/events/services/cache";
import { root } from "./src/server/root";

const wranglerConfigPath = fileURLToPath(new URL("wrangler.jsonc", import.meta.url));

export default defineConfig({
  output: "static",
  adapter: cloudflare(),
  cache: {
    provider: cacheCloudflare(),
  },
  routeRules: {
    "/[locale]/events": {
      maxAge: EVENT_PAGE_CACHE_MAX_AGE_SECONDS,
      swr: EVENT_PAGE_CACHE_SWR_SECONDS,
    },
    "/api/events": {
      maxAge: EVENT_PAGE_CACHE_MAX_AGE_SECONDS,
      swr: EVENT_PAGE_CACHE_SWR_SECONDS,
    },
    "/api/events/[...path]": {
      maxAge: EVENT_PAGE_CACHE_MAX_AGE_SECONDS,
      swr: EVENT_PAGE_CACHE_SWR_SECONDS,
    },
    "/api/events/status/[...path]": {
      maxAge: 0,
      swr: 0,
    },
  },
  session: false,
  security: {
    csp: CSP_CONFIG,
  },
  env: {
    schema: {
      TURNSTILE_SITE_KEY: envField.string({ context: "client", access: "public" }),
      TURNSTILE_SCRIPT_URL: envField.string({ context: "client", access: "public" }),
      PUBLIC_REPOSITORY_URL: envField.string({
        context: "client",
        access: "public",
        default: repository.url,
      }),
    },
  },
  integrations: [
    preact(),
    intlayer(),
    betterAuthUrl({ configPath: wranglerConfigPath }),
    securityHeadersFile({ fileName: "_headers" }),
    modulePreloads(),
    workerRouting({
      wranglerConfigFile: "wrangler.json",
      hono: root,
    }),
  ],
  markdown: {
    // Shiki emits inline styles that the strict CSP would block.
    // No page currently renders Markdown code blocks, so disable highlighting
    // Until a CSP-compatible highlighter is configured.
    syntaxHighlight: false,
  },
  build: {
    inlineStylesheets: "never",
  },
  vite: {
    plugins: [pandacss({ transform: true }), Qui.vite({ styles: false })],
    resolve: {
      tsconfigPaths: true,
    },
    build: {
      assetsInlineLimit: 0,
    },
  },
});
