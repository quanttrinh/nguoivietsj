import type { I18nOptions } from "./plugins/i18n";

/** Single source of truth for locales and generated-output settings. */
export const i18nConfig: I18nOptions = {
  locales: ["en", "fr", "vi"],
  defaultLocale: "en",
  localeNames: { en: "English", fr: "Français", vi: "Tiếng Việt" },
  translationsDir: "translations",
  client: {
    sourceDir: "src",
    outDir: "src/generated/client",
  },
  server: {
    outDir: "src/generated/server",
  },
};
