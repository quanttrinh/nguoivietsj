// @boundary server
import { type as ark } from "arktype";
import { getDictionary } from "intlayer";

import engineApiMessages from "~/events/content/api-messages.content";
import sharedApiMessages from "~/server/middleware/localize-api-errors/api-messages.content";
import { localeSchema } from "~/shared/constants/locale-schema";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";

type MessageCatalog = Record<string, string>;

function messageCatalog(locale: string): MessageCatalog {
  return {
    ...getDictionary(sharedApiMessages, locale),
    ...getDictionary(engineApiMessages, locale),
  };
}

function supportedLocale(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const exact = normalized.split(";")[0]?.trim() ?? "";
  const exactLocale = localeSchema(exact);

  if (!(exactLocale instanceof ark.errors)) {
    return exactLocale;
  }

  const base = exact.split("-")[0];
  const baseLocale = localeSchema(base);

  return baseLocale instanceof ark.errors ? null : baseLocale;
}

/** Resolve an API locale from an explicit locale, locale header, or Accept-Language. */
export function resolveRequestLocale(request: Request): string {
  const url = new URL(request.url);
  const queryLocale = supportedLocale(url.searchParams.get("locale"));

  if (queryLocale !== null) {
    return queryLocale;
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

/** Localized API error text for a stable error code. */
export function apiMessage(code: string, locale: string): string {
  const safeLocale = supportedLocale(locale) ?? DEFAULT_LOCALE;
  const catalog = messageCatalog(safeLocale);
  const fallback = safeLocale === DEFAULT_LOCALE ? catalog : messageCatalog(DEFAULT_LOCALE);

  return catalog[code] ?? fallback[code] ?? catalog.generic_error ?? fallback.generic_error ?? "";
}
