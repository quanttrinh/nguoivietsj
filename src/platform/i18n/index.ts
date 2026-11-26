// @boundary shared
/* oxlint-disable eslint/id-length -- `t` is the authored localization marker. */

import { defaultLocale, localeNames, locales, type Locale } from "~/generated/i18n-types";

export { defaultLocale, localeNames, locales, type Locale } from "~/generated/i18n-types";
export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "~/generated/i18n-types";

export type LocalizedValue = string | readonly string[];

export interface Translation<
  T extends Record<string, LocalizedValue> = Record<string, LocalizedValue>,
> {
  translation: T;
}

/** Build-time marker for a localized string. */
export function t<T extends Record<string, LocalizedValue>>(value: T): Translation<T> {
  return { translation: value };
}

export interface Dictionary<TContent extends Record<string, unknown> = Record<string, unknown>> {
  key: string;
  content: TContent;
}

/** Standard wrapper for authored dictionaries. */
export function defineDictionary<TKey extends string, TContent extends Record<string, unknown>>(
  key: TKey,
  content: TContent,
): Dictionary<TContent> & { key: TKey } {
  return { key, content };
}

type PlainValues<TSource> = TSource extends { translation: infer TTranslation }
  ? TTranslation[keyof TTranslation] extends infer TValue
    ? TValue extends readonly unknown[]
      ? string[]
      : string
    : never
  : TSource extends readonly unknown[]
    ? string[]
    : TSource extends Record<string, unknown>
      ? { [Key in keyof TSource]: PlainValues<TSource[Key]> }
      : TSource;

/** Plain localized values for a dictionary's content. */
export type DictionaryValues<T> = T extends { content: infer TContent }
  ? PlainValues<TContent>
  : PlainValues<T>;

function isTranslation(value: unknown): value is Translation {
  return typeof value === "object" && value !== null && "translation" in value;
}

function localize(value: unknown, locale: string): unknown {
  if (isTranslation(value)) {
    return value.translation[locale] ?? value.translation[defaultLocale];
  }

  if (Array.isArray(value)) {
    return value.map((item) => localize(item, locale));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, localize(item, locale)]),
    );
  }

  return value;
}

function isDictionary(source: unknown): source is Dictionary {
  return (
    typeof source === "object" &&
    source !== null &&
    "key" in source &&
    typeof source.key === "string" &&
    "content" in source
  );
}

function dictionaryContent(source: unknown): unknown {
  return isDictionary(source) ? source.content : source;
}

/** Resolve a dictionary to plain localized strings. */
export function getDictionary<T>(source: T, locale: string): DictionaryValues<T> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- localize preserves the dictionary shape.
  return localize(dictionaryContent(source), locale) as DictionaryValues<T>;
}

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
