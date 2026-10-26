// @boundary client
import { type JSX } from "preact";

import { styles } from "../shared/registration-styles";
import { type PublicRegistrationConfig } from "../shared/registration-types";
import { type RegistrationSuccess as RegistrationSuccessState } from "./registration-submit";

function warningTitle(code: string, staff: boolean, config: PublicRegistrationConfig): string {
  if (code === "event_registration_email_not_queued") {
    return staff ? config.messages.staffEmailFailedTitle : config.messages.emailFailedTitle;
  }

  return config.messages.warningTitle;
}

function warningMessage(
  warning: { code: string; message?: string | undefined },
  staff: boolean,
  config: PublicRegistrationConfig,
): string {
  if (warning.message !== undefined && warning.message.length > 0) {
    return warning.message;
  }

  if (warning.code === "event_registration_email_not_queued") {
    return staff ? config.messages.staffEmailFailed : config.messages.emailFailed;
  }

  return warning.code;
}

export function RegistrationSuccess(props: {
  success: RegistrationSuccessState;
  config: PublicRegistrationConfig;
  staff?: boolean | undefined;
}): JSX.Element {
  const staff = props.staff === true;

  return (
    <>
      {props.success.warnings.map((warning) => (
        <div
          key={`${warning.code}:${warning.ref ?? warning.path ?? warning.message ?? "warning"}`}
          class={styles.errorPanel}
          role="alert"
        >
          <strong class={styles.errorTitle}>
            {warningTitle(warning.code, staff, props.config)}
          </strong>
          <span>{warningMessage(warning, staff, props.config)}</span>
        </div>
      ))}
      <span class={styles.reference}>
        {props.config.successReference}: <code>{props.success.id}</code>
      </span>
      {props.success.statusUrl && (
        <a class={styles.statusLink} href={props.success.statusUrl}>
          {props.config.statusLink}
        </a>
      )}
    </>
  );
}
