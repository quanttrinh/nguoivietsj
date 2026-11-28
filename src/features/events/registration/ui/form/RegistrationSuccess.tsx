// @boundary client
import type { JSX } from "preact";

import { styles } from "../shared/registration-styles";
import type { PublicRegistrationConfig } from "../shared/registration-types";
import type { RegistrationSuccess as RegistrationSuccessState } from "./registration-submit";

function warningTitle(code: string, staff: boolean, config: PublicRegistrationConfig) {
  if (code === "event_registration_email_not_queued") {
    return staff
      ? config.labels.engineRegistration.success.staffEmailFailedTitle
      : config.labels.engineRegistration.success.emailFailedTitle;
  }

  return config.labels.engineRegistration.errors.warningTitle;
}

function warningMessage(
  warning: { code: string; message?: string | undefined },
  staff: boolean,
  config: PublicRegistrationConfig,
) {
  if (warning.message !== undefined && warning.message.length > 0) {
    return warning.message;
  }

  if (warning.code === "event_registration_email_not_queued") {
    return staff
      ? config.labels.engineRegistration.success.staffEmailFailed
      : config.labels.engineRegistration.success.emailFailed;
  }

  return warning.code;
}

export function RegistrationSuccess({
  success,
  config,
  staff: staffProp,
}: {
  success: RegistrationSuccessState;
  config: PublicRegistrationConfig;
  staff?: boolean | undefined;
}): JSX.Element {
  const staff = staffProp === true;

  return (
    <>
      {success.warnings.map((warning) => (
        <div
          key={`${warning.code}:${warning.ref ?? warning.path ?? warning.message ?? "warning"}`}
          class={styles.errorPanel}
          role="alert"
        >
          <strong class={styles.errorTitle}>{warningTitle(warning.code, staff, config)}</strong>
          <span>{warningMessage(warning, staff, config)}</span>
        </div>
      ))}
      <span class={styles.reference}>
        {config.labels.engineRegistration.success.reference}: <code>{success.id}</code>
      </span>
      {success.statusUrl && (
        <a class={styles.statusLink} href={success.statusUrl}>
          {config.labels.engineRegistration.success.statusLink}
        </a>
      )}
    </>
  );
}
