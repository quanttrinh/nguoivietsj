// @boundary shared
/* oxlint-disable eslint/max-params -- Localized resolution keeps explicit locale/fallback context. */

import type { LocalizedText } from "~/features/events/domain/types";
import { defaultLocale } from "~/platform/i18n";

/** Resolve localized text with event-default, default-locale, then first-value fallback. */
export function localized(
  text: LocalizedText | undefined,
  locale: string,
  fallback: string,
  eventDefaultLocale?: string,
): string {
  if (text === undefined) {
    return fallback;
  }

  return (
    text[locale] ??
    (eventDefaultLocale === undefined ? undefined : text[eventDefaultLocale]) ??
    text[defaultLocale] ??
    Object.values(text)[0] ??
    fallback
  );
}

export function nullableLocalized(
  text: LocalizedText | undefined,
  locale: string,
  eventDefaultLocale?: string,
): string | null {
  const value = localized(text, locale, "", eventDefaultLocale);
  return value.length > 0 ? value : null;
}
