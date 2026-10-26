// @boundary client
import { type JSX } from "preact";
import { useState } from "preact/hooks";

import { type ResolvedRegistrationForm } from "~/events/domain/form-schema/resolve/resolve";

import { readRegistrationSuccess } from "../form/registration-success-storage";
import { RegistrationForm } from "../form/RegistrationForm";
import { styles } from "../shared/registration-styles";
import { type PublicRegistrationConfig } from "../shared/registration-types";
import { InfoBlock } from "./RegistrationInfo";

export function Page(props: {
  form: ResolvedRegistrationForm;
  config: PublicRegistrationConfig;
  preview?: boolean | undefined;
  staff?: boolean | undefined;
}): JSX.Element {
  const staff = props.staff === true;
  const storedSuccess =
    !("location" in globalThis) ||
    new URLSearchParams(globalThis.location.search).get("registered") !== "1"
      ? null
      : readRegistrationSuccess(staff, props.form.event.id);
  const [completed, setCompleted] = useState(storedSuccess !== null);
  const messages = props.config.messages;
  let heading = staff ? props.config.staffFormTitle : props.config.formTitle;
  let description = staff ? props.config.staffFormDescription : props.config.formDescription;

  if (completed) {
    heading = staff ? messages.staffSuccessTitle : messages.successTitle;
    description = staff ? messages.staffSuccessBody : messages.successBody;
  }

  return (
    <section class={styles.section}>
      <div class={styles.heroSection}>
        <div class={styles.hero}>
          <h1 class={styles.title}>{props.form.event.title}</h1>
          {props.form.event.summary.length > 0 ? (
            <p class={styles.lead}>{props.form.event.summary}</p>
          ) : null}
        </div>
        <InfoBlock form={props.form} config={props.config} />
      </div>

      <div class={styles.panel}>
        <h2 id="engine-registration-heading" class={styles.cardTitle}>
          {heading}
        </h2>
        <p class={styles.cardDescription}>{description}</p>

        {props.form.event.registrationOpen || props.staff === true || completed ? (
          <RegistrationForm
            form={props.form}
            config={props.config}
            preview={props.preview === true}
            staff={props.staff === true}
            initialSuccess={storedSuccess}
            onSuccess={() => {
              setCompleted(true);
            }}
          />
        ) : (
          <div class={styles.errorBox} role="alert">
            <strong>{props.config.registrationClosed}</strong>
            <br />
            {props.config.registrationClosedBody}
          </div>
        )}
      </div>
    </section>
  );
}
