// @boundary shared
/** Response headers shared by API helpers and feature routes. */

export const NO_STORE = { "cache-control": "no-store" } as const;

export const LOCALE_VARY = { vary: "Accept-Language, X-Locale" } as const;
