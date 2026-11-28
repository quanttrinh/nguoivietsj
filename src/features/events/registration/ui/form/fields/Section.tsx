// @boundary client
import type { JSX } from "preact";

import { vstack } from "styled-system/patterns";
import type { ResolvedSection } from "~/features/events/domain/form-schema/resolve/resolve";
import type { FormStateVisibility } from "~/features/events/domain/form-schema/state";
import type { EngineClientConfig } from "~/features/events/domain/form-schema/types";

import { styles } from "../../shared/registration-styles";
import type { PublicRegistrationConfig } from "../../shared/registration-types";
import {
  fieldRequired,
  fieldVisible,
  type RegistrationFieldContext,
  type RegistrationValues,
} from "../registration-form-state";
import type { FieldErrors } from "./field-types";
import { RegistrationField } from "./RegistrationField";

interface SectionProps {
  section: ResolvedSection;
  config: PublicRegistrationConfig;
  client: EngineClientConfig;
  values: RegistrationValues;
  state: FormStateVisibility;
  errors: FieldErrors;
  initialized: boolean;
}

export function Section({
  section,
  config,
  client,
  values,
  state,
  errors,
  initialized,
}: SectionProps): JSX.Element {
  const context: RegistrationFieldContext = {
    values,
    config: client,
    state,
  };
  const fields = section.fields.map((field) => ({
    field,
    visible: fieldVisible(field.ref, context),
    required: fieldRequired(field.ref, context),
  }));
  const visible = fields.some((entry) => entry.visible);

  return (
    <section class={styles.formSection} data-section={section.key} hidden={!visible}>
      <div
        class={vstack({
          alignItems: "stretch",
          gap: "1",
        })}
      >
        <h3 class={styles.sectionTitle}>{section.label}</h3>
        {section.description && <p class={styles.sectionDescription}>{section.description}</p>}
      </div>
      <div class={styles.fields} data-fields>
        {fields.map((entry) => (
          <RegistrationField
            key={entry.field.ref}
            field={entry.field}
            config={config}
            client={client}
            values={values}
            state={state}
            errors={errors}
            initialized={initialized}
            visible={entry.visible}
            required={entry.required}
          />
        ))}
      </div>
    </section>
  );
}
