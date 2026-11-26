// @boundary shared
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "~/generated/i18n-types";

function supportedLocale(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const exact = normalized.split(";")[0]?.trim() ?? "";

  if (SUPPORTED_LOCALES.has(exact)) {
    return exact;
  }

  const base = exact.split("-")[0] ?? "";

  return SUPPORTED_LOCALES.has(base) ? base : null;
}

/**
 * Resolve the locale of a request from `x-locale` or `Accept-Language`.
 * Auth additionally accepts `?locale` (Better Auth links carry it).
 */
export function resolveRequestLocale(
  request: Request,
  options: { allowQuery?: boolean } = {},
): string {
  if (options.allowQuery === true) {
    const queryLocale = supportedLocale(new URL(request.url).searchParams.get("locale"));

    if (queryLocale !== null) {
      return queryLocale;
    }
  }

  const headerLocale = supportedLocale(request.headers.get("x-locale"));

  if (headerLocale !== null) {
    return headerLocale;
  }

  for (const part of (request.headers.get("accept-language") ?? "").split(",")) {
    const locale = supportedLocale(part);

    if (locale !== null) {
      return locale;
    }
  }

  return DEFAULT_LOCALE;
}
