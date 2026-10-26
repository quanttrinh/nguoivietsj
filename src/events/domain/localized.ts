/* oxlint-disable eslint/max-params -- Localized resolution keeps explicit locale/fallback context. */

import type { LocalizedText } from "~/events/domain/types";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";

/** Resolve localized text with event-default, default-locale, then first-value fallback. */
export function localized(
  text: LocalizedText | undefined,
  locale: string,
  fallback: string,
  defaultLocale?: string,
): string {
  if (text === undefined) {
    return fallback;
  }

  return (
    text[locale] ??
    (defaultLocale === undefined ? undefined : text[defaultLocale]) ??
    text[DEFAULT_LOCALE] ??
    Object.values(text)[0] ??
    fallback
  );
}

export function nullableLocalized(
  text: LocalizedText | undefined,
  locale: string,
  defaultLocale?: string,
): string | null {
  const value = localized(text, locale, "", defaultLocale);
  return value.length > 0 ? value : null;
}
