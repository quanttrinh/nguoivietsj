// @boundary client
import { type JSX } from "preact";

import { vstack } from "styled-system/patterns";
import { type ResolvedSection } from "~/events/domain/form-schema/resolve/resolve";
import { type FormStateVisibility } from "~/events/domain/form-schema/state";
import { type EngineClientConfig } from "~/events/domain/form-schema/types";

import { styles } from "../../shared/registration-styles";
import { type PublicRegistrationConfig } from "../../shared/registration-types";
import {
  fieldRequired,
  fieldVisible,
  type RegistrationFieldContext,
  type RegistrationValues,
} from "../registration-form-state";
import { type FieldErrors } from "./field-types";
import { RegistrationField } from "./RegistrationField";

export interface SectionProps {
  section: ResolvedSection;
  config: PublicRegistrationConfig;
  client: EngineClientConfig;
  values: RegistrationValues;
  state: FormStateVisibility;
  errors: FieldErrors;
  initialized: boolean;
}

export function Section(props: SectionProps): JSX.Element {
  const context: RegistrationFieldContext = {
    values: props.values,
    config: props.client,
    state: props.state,
  };
  const fields = props.section.fields.map((field) => ({
    field,
    visible: fieldVisible(field.ref, context),
    required: fieldRequired(field.ref, context),
  }));
  const visible = fields.some((entry) => entry.visible);

  return (
    <section class={styles.formSection} data-section={props.section.key} hidden={!visible}>
      <div
        class={vstack({
          alignItems: "stretch",
          gap: "1",
        })}
      >
        <h3 class={styles.sectionTitle}>{props.section.label}</h3>
        {props.section.description && (
          <p class={styles.sectionDescription}>{props.section.description}</p>
        )}
      </div>
      <div class={styles.fields} data-fields>
        {fields.map((entry) => (
          <RegistrationField
            key={entry.field.ref}
            field={entry.field}
            config={props.config}
            client={props.client}
            values={props.values}
            state={props.state}
            errors={props.errors}
            initialized={props.initialized}
            visible={entry.visible}
            required={entry.required}
          />
        ))}
      </div>
    </section>
  );
}
