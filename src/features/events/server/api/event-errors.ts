// @boundary server
import { localized as engineApiMessages } from "~/generated/server/engineApiMessages";
import { defaultLocale, isLocale } from "~/platform/i18n";
import { resolveRequestLocale } from "~/platform/i18n/resolve";
import { createFeatureApiError } from "~/platform/server/api/helpers/responses/api-error-factory";
import { sharedMessage } from "~/platform/server/api/helpers/responses/shared-api-error";

type EventCatalog = Record<string, string>;

const catalog = (locale: string): EventCatalog =>
  engineApiMessages(isLocale(locale) ? locale : defaultLocale).engineApiMessages;

/** Event-specific API errors with request-locale-aware messages. */
export const eventApiError = createFeatureApiError({
  catalog,
  fallback: (locale) => sharedMessage("generic_error", locale),
  resolveLocale: resolveRequestLocale,
});

/** Resolve an event message code for a given locale (used by warning bodies). */
export function eventMessage(code: string, locale: string): string {
  const messages = catalog(locale);
  const defaultMessages = catalog(defaultLocale);

  return messages[code] ?? defaultMessages[code] ?? sharedMessage("generic_error", locale);
}
