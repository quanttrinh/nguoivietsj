// @boundary server
import { localized as engineApiMessages } from "~/generated/server/engineApiMessages";
import { defaultLocale, isLocale } from "~/shared/i18n";
import { resolveRequestLocale } from "~/shared/i18n/resolve";

import { createFeatureApiError } from "../../helpers/responses/api-error-factory";

const catalog = (locale: string) =>
  engineApiMessages(isLocale(locale) ? locale : defaultLocale).engineApiMessages;

/** Event-specific API errors with request-locale-aware messages. */
export const eventApiError = createFeatureApiError({
  catalog,
  fallback: "Something went wrong.",
  resolveLocale: resolveRequestLocale,
});
