// @boundary server
import { localized as sharedApiMessages } from "~/generated/server/sharedApiMessages";
import { defaultLocale, isLocale } from "~/shared/i18n";
import { resolveRequestLocale } from "~/shared/i18n/resolve";

import { createFeatureApiError } from "./api-error-factory";

const catalog = (locale: string) =>
  sharedApiMessages(isLocale(locale) ? locale : defaultLocale).sharedApiMessages;

const fallback = "Something went wrong.";

/** Error helper for shared/infra codes: message resolved from the request locale. */
export const sharedApiError = createFeatureApiError({
  catalog,
  fallback,
  resolveLocale: resolveRequestLocale,
});

/** Resolve a shared message code for a given locale (used by the auth response rewriter). */
export function sharedMessage(code: string, locale: string): string {
  const messages = catalog(locale) as Record<string, string>;
  const defaultMessages = catalog(defaultLocale) as Record<string, string>;

  return (
    messages[code] ??
    defaultMessages[code] ??
    messages.generic_error ??
    defaultMessages.generic_error ??
    ""
  );
}

/** Auth-specific locale resolution: ?locale takes precedence for Better Auth links. */
export function resolveAuthLocale(request: Request): string {
  return resolveRequestLocale(request, { allowQuery: true });
}
