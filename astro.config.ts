import { fileURLToPath } from "node:url";

import { precompile } from "@ark/aot/unplugin";
import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";
import pandacss from "@pandacss/vite";
import Qui from "@quanttrinh/qui-unplugin";
import { defineConfig, envField } from "astro/config";

import { i18nConfig } from "./i18n.config";
import { CSP_CONFIG } from "./plugins/csp-astro";
import { i18nIntegration } from "./plugins/i18n";
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
  i18n: {
    defaultLocale: i18nConfig.defaultLocale,
    locales: [...i18nConfig.locales],
    routing: { prefixDefaultLocale: true },
  },
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
    i18nIntegration(i18nConfig),
    workerOrigin({ configPath: wranglerConfigPath }),
    securityHeadersFile({ fileName: "_headers" }),
    modulePreloads({
      global: {
        preload: ["astro:transitions/client", "preact", "~/platform/client/api/client"],
      },
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
    plugins: [precompile.vite(), pandacss({ transform: true }), Qui.vite({ styles: false })],
    resolve: {
      tsconfigPaths: true,
    },
    build: {
      assetsInlineLimit: 0,
    },
  },
});
