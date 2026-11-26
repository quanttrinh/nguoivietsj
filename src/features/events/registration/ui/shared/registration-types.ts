// @boundary client
import type { PublicRegistrationLabels } from "~/generated/client/PublicRegistration";
import type { Locale as DeclaredLocales } from "~/platform/i18n";

export interface PublicRegistrationConfig {
  locale: DeclaredLocales;
  labels: PublicRegistrationLabels;
  turnstile: {
    siteKey: string;
    action: string;
  };
}
