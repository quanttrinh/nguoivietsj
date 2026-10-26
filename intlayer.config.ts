import { Locales, type IntlayerConfig } from "intlayer";

const config: IntlayerConfig = {
  internationalization: {
    locales: [Locales.ENGLISH, Locales.FRENCH, Locales.VIETNAMESE],
    defaultLocale: Locales.ENGLISH,
    requiredLocales: [Locales.ENGLISH],
  },
  content: {
    fileExtensions: [".content.ts"],
  },
  system: {
    cacheDir: "/tmp/intlayer-cache",
  },
  routing: {
    mode: "prefix-all",
    enableProxy: false,
  },
};

export default config;
