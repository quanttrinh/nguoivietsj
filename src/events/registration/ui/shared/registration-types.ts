// @boundary client
import type { DeclaredLocales } from "intlayer";

import type { RegistrationContentValues } from "~/events/content/registration.content";

export type RegistrationErrorMessages = RegistrationContentValues["errors"];
export interface PublicRegistrationConfig {
  locale: DeclaredLocales;
  labels: RegistrationContentValues;
  turnstile: {
    siteKey: string;
    action: string;
  };
}
export interface Props {
  config: PublicRegistrationConfig;
  preview?: boolean;
  staff?: boolean;
}
