// @boundary shared
import { defaultLocale, isLocale } from "~/platform/i18n";

/** Resolve a caller-supplied locale to a supported one, falling back to the default. */
export function resolveStatusLocale(locale: string | null | undefined): string {
  return locale !== null && locale !== undefined && isLocale(locale) ? locale : defaultLocale;
}

/** Locale-aware path of the registration status view page. */
export function statusViewPath(locale: string | null | undefined): string {
  return `/${resolveStatusLocale(locale)}/events/status/view`;
}

/**
 * Build a same-origin magic link that exchanges a registration token for an
 * HttpOnly status session cookie before redirecting to the status page.
 */
export function statusPageUrl(baseUrl: string, locale: string, token: string): string {
  const url = new URL("/api/events/status/link", new URL(baseUrl).origin);
  url.searchParams.set("token", token);
  url.searchParams.set("locale", resolveStatusLocale(locale));

  return url.toString();
}
