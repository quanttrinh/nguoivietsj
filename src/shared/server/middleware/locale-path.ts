import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../../constants/locales";
import { LOCALE_KEY_REGEX } from "../../constants/patterns";

const NON_LOCALIZED_PREFIXES = ["/api", "/_astro", "/_image", "/_server-islands", "/cdn-cgi"];

export interface LocalePathMatch {
  locale: string;
  rest: string[];
  redirect: boolean;
}

/** Resolve a locale prefix and whether the request should redirect. */
export function matchLocalePath(pathname: string): LocalePathMatch | null {
  if (
    NON_LOCALIZED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }

  const [first, ...rest] = pathname.split("/").filter(Boolean);

  if (first === undefined) {
    return null;
  }

  if (SUPPORTED_LOCALES.has(first)) {
    return { locale: first, rest, redirect: false };
  }

  if (LOCALE_KEY_REGEX.test(first)) {
    return { locale: DEFAULT_LOCALE, rest, redirect: true };
  }

  // Keep the default-locale entry point usable for the event engine.
  if (first === "events") {
    return { locale: DEFAULT_LOCALE, rest: [first, ...rest], redirect: true };
  }

  return null;
}
