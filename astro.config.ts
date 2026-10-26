import { fileURLToPath } from "node:url";

import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import preact from "@astrojs/preact";
import pandacss from "@pandacss/vite";
import Qui from "@quanttrinh/qui-unplugin";
import { intlayer } from "astro-intlayer";
import { defineConfig, envField } from "astro/config";

import { modulePreloads } from "./plugins/module-preloads";
import { securityHeadersFile } from "./plugins/security-headers-file";
import { workerRouting } from "./plugins/worker-routing";
import {
  EVENT_PAGE_CACHE_MAX_AGE_SECONDS,
  EVENT_PAGE_CACHE_SWR_SECONDS,
} from "./src/events/server/cache";
import {
  CSP_META_DIRECTIVES,
  CSP_SCRIPT_SOURCES,
  CSP_STYLE_SOURCES,
} from "./src/shared/constants/security";

export default defineConfig({
  output: "static",
  adapter: cloudflare(),
  cache: {
    provider: cacheCloudflare(),
  },
  prefetch: {
    prefetchAll: true,
  },
  routeRules: {
    "/[locale]/events": {
      maxAge: EVENT_PAGE_CACHE_MAX_AGE_SECONDS,
      swr: EVENT_PAGE_CACHE_SWR_SECONDS,
    },
    "/api/events/public/events": {
      maxAge: EVENT_PAGE_CACHE_MAX_AGE_SECONDS,
      swr: EVENT_PAGE_CACHE_SWR_SECONDS,
    },
    "/api/events/public/events/[...path]": {
      maxAge: EVENT_PAGE_CACHE_MAX_AGE_SECONDS,
      swr: EVENT_PAGE_CACHE_SWR_SECONDS,
    },
  },
  session: false,
  security: {
    csp: {
      scriptDirective: {
        resources: [...CSP_SCRIPT_SOURCES],
      },
      styleDirective: {
        resources: [...CSP_STYLE_SOURCES],
      },
      directives: [...CSP_META_DIRECTIVES],
    },
  },
  env: {
    schema: {
      TURNSTILE_SITE_KEY: envField.string({ context: "client", access: "public" }),
      TURNSTILE_SCRIPT_URL: envField.string({ context: "client", access: "public" }),
      // Development-only staff identity used when Cloudflare Access is absent.
      DEV_STAFF_EMAIL: envField.string({ context: "server", access: "public", optional: true }),
    },
  },
  integrations: [preact(), intlayer(), securityHeadersFile(), modulePreloads(), workerRouting()],
  build: {
    inlineStylesheets: "never",
  },
  vite: {
    plugins: [pandacss({ transform: true }), Qui.vite({ styles: false })],
    resolve: {
      alias: {
        "~": fileURLToPath(new URL("src", import.meta.url)),
        "styled-system": fileURLToPath(new URL("styled-system", import.meta.url)),
      },
    },
    build: {
      assetsInlineLimit: 0,
    },
  },
});
