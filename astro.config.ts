import { fileURLToPath } from "node:url";

import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";
import pandacss from "@pandacss/vite";
import Qui from "@quanttrinh/qui-unplugin";
import { intlayer } from "astro-intlayer";
import { defineConfig, envField } from "astro/config";

import { CSP_CONFIG } from "./plugins/csp-astro";
import { modulePreloads } from "./plugins/module-preloads";
import { securityHeadersFile } from "./plugins/security-headers-file";
import { workerOrigin } from "./plugins/worker-origin";

const wranglerConfigName = process.env.WRANGLER_CONFIG ?? "wrangler.json";
const wranglerConfigPath = fileURLToPath(new URL(wranglerConfigName, import.meta.url));

export default defineConfig({
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  output: "static",
  adapter: cloudflare({ imageService: "compile", configPath: wranglerConfigName }),
  session: false,
  security: {
    csp: CSP_CONFIG,
  },
  env: {
    schema: {
      TURNSTILE_SITE_KEY: envField.string({ context: "client", access: "public" }),
      TURNSTILE_SCRIPT_URL: envField.string({ context: "client", access: "public" }),
      PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN: envField.string({
        context: "client",
        access: "public",
        default: "",
      }),
    },
  },
  integrations: [
    preact(),
    intlayer(),
    workerOrigin({ configPath: wranglerConfigPath }),
    securityHeadersFile({ fileName: "_headers" }),
    modulePreloads({
      global: {
        preload: ["astro:transitions/client", "preact", "~/shared/client/api/client"],
      },
      // The camera scanner is lazy-loaded; warm it in the HTTP cache on check-in pages only.
      routes: [{ match: /\/admin\/events\/view\/checkin\/$/u, prefetch: [{ package: "qr" }] }],
      budget: 120_000,
    }),
  ],
  markdown: {
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
