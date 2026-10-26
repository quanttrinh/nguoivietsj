import { defaultLocale, locales } from "intlayer";

/** Default locale used when a path omits or uses an unsupported locale. */
export const DEFAULT_LOCALE: string = defaultLocale;

/** All locales configured by Intlayer, shared instead of rebuilt per request. */
export const SUPPORTED_LOCALES: ReadonlySet<string> = new Set<string>(locales);
