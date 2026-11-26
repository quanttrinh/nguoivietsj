// @boundary shared
import {
  defaultLocale,
  localeNames,
  locales,
  type Locale,
  type Messages,
  type PickByPaths,
  type Widen,
} from "~/generated/i18n-types";

export { defaultLocale, localeNames, locales, type Locale } from "~/generated/i18n-types";
export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "~/generated/i18n-types";

/** Plain label strings for an explicit subset of message paths. */
export type SubsetLabels<Paths extends Record<string, unknown>> = Widen<
  PickByPaths<Messages, Paths>
>;

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Extract the locale prefix from a pathname, falling back to the default locale. */
export function getLocaleFromPath(pathname: string): Locale {
  const first = pathname.split("/").find((segment) => segment.length > 0);

  return first !== undefined && isLocale(first) ? first : defaultLocale;
}

/** Remove a leading locale prefix from a pathname. */
export function getPathWithoutLocale(pathname: string): string {
  const first = pathname.split("/").find((segment) => segment.length > 0);

  if (first === undefined || !isLocale(first)) {
    return pathname;
  }

  const stripped = pathname.slice(first.length + 2);

  return stripped.length === 0 ? "/" : `/${stripped}`;
}

/** Build a locale-prefixed path (every locale is prefixed, including the default). */
export function getLocalizedUrl(path: string, locale: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  return normalized === "/" ? `/${locale}/` : `/${locale}${normalized}`;
}

export function getLocaleName(locale: string): string {
  return isLocale(locale) ? localeNames[locale] : locale;
}

export function getHTMLTextDir(locale: string): "ltr" | "rtl" {
  return locale === "ar" || locale === "he" || locale === "fa" ? "rtl" : "ltr";
}

/** Resolve the active locale from the document, for browser-only callers. */
export function resolveBrowserLocale(): Locale {
  const documentObject: Document | undefined = globalThis.document;

  // oxlint-disable-next-line typescript/no-unnecessary-condition -- DOM globals are absent in Workers despite the ambient types.
  if (documentObject === undefined) {
    return defaultLocale;
  }

  const declared = documentObject.documentElement.lang;

  if (isLocale(declared)) {
    return declared;
  }

  return getLocaleFromPath(globalThis.location.pathname);
}

/** Locale helpers for Astro frontmatter, derived from the request URL. */
export function useLocale(url: URL): { locale: Locale; availableLocales: readonly Locale[] } {
  return { locale: getLocaleFromPath(url.pathname), availableLocales: locales };
}
