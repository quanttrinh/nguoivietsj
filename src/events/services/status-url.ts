// @boundary server
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "~/shared/constants/locales";

/** Build a same-origin status-page URL for a registration token. */
export function statusPageUrl(baseUrl: string, locale: string, token: string): string {
  const base = new URL(baseUrl);
  // Reject caller-provided locales that could make the path protocol-relative.
  // Unsupported values fall back to the configured default.
  const safeLocale = SUPPORTED_LOCALES.has(locale) ? locale : DEFAULT_LOCALE;
  const url = new URL(`/${safeLocale}/events/status/view`, base.origin);
  url.searchParams.set("token", token);

  if (url.origin !== base.origin) {
    throw new Error("status_page_origin_mismatch");
  }

  return url.toString();
}
