// @boundary client
import type { JSX } from "preact";
import { useState } from "preact/hooks";

import type { ResolvedRegistrationForm } from "~/events/domain/form-schema/resolve/resolve";

import { readRegistrationSuccess } from "../form/registration-success-storage";
import { RegistrationForm } from "../form/RegistrationForm";
import { styles } from "../shared/registration-styles";
import type { PublicRegistrationConfig } from "../shared/registration-types";
import { InfoBlock } from "./RegistrationInfo";

export function Page({
  form,
  config,
  preview,
  staff: staffProp,
}: {
  form: ResolvedRegistrationForm;
  config: PublicRegistrationConfig;
  preview?: boolean | undefined;
  staff?: boolean | undefined;
}): JSX.Element {
  const staff = staffProp === true;
  const storedSuccess =
    !("location" in globalThis) ||
    new URLSearchParams(globalThis.location.search).get("registered") !== "1"
      ? null
      : readRegistrationSuccess(staff, form.event.id);
  const [completed, setCompleted] = useState(storedSuccess !== null);
  const messages = config.labels;
  let heading = staff
    ? config.labels.engineRegistration.form.staffTitle
    : config.labels.shared.yourRegistration;
  let description = staff
    ? config.labels.engineRegistration.form.staffDescription
    : config.labels.engineRegistration.form.description;

  if (completed) {
    heading = staff
      ? messages.engineRegistration.success.staffTitle
      : messages.engineRegistration.success.title;
    description = staff
      ? messages.engineRegistration.success.staffBody
      : messages.engineRegistration.success.body;
  }

  return (
    <section class={styles.section}>
      <div class={styles.heroSection}>
        <div class={styles.hero}>
          <h1 class={styles.title}>{form.event.title}</h1>
          {form.event.summary.length > 0 ? <p class={styles.lead}>{form.event.summary}</p> : null}
        </div>
        <InfoBlock form={form} config={config} />
      </div>

      <div class={styles.panel}>
        <h2 id="engine-registration-heading" class={styles.cardTitle}>
          {heading}
        </h2>
        <p class={styles.cardDescription}>{description}</p>

        {form.event.registrationOpen || staff || completed ? (
          <RegistrationForm
            form={form}
            config={config}
            preview={preview ?? false}
            staff={staff}
            initialSuccess={storedSuccess}
            onSuccess={() => {
              setCompleted(true);
            }}
          />
        ) : (
          <div class={styles.errorBox} role="alert">
            <strong>{config.labels.engineRegistration.event.registrationClosed}</strong>
            <br />
            {config.labels.engineRegistration.event.registrationClosedBody}
          </div>
        )}
      </div>
    </section>
  );
}
