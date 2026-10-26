/* oxlint-disable eslint/no-nested-ternary, unicorn/no-nested-ternary, eslint/no-negated-condition, unicorn/no-negated-condition -- Direct schema-driven rendering keeps related options together. */
import type { JSX } from "preact";

import { vstack } from "styled-system/patterns";
import {
  FORM_CONFIRMATION_FIELD_NAME,
  FORM_FIELD_KIND,
  FORM_OVERRIDE_KEY,
  FORM_REF_PREFIX,
} from "~/events/domain/form-schema/constants";
import type {
  ResolvedField,
  ResolvedRegistrationForm,
} from "~/events/domain/form-schema/resolve/resolve";

import { styles } from "../registration-styles";
import type { PublicRegistrationConfig } from "../registration-types";
import { ContactField, MailField } from "./contact-fields";
import { CustomField } from "./custom-fields";
import { ErrorText, FieldShell, Label, TextField, domId } from "./field-primitives";
import { GroupField } from "./group-fields";
import { TicketField } from "./ticket-field";

export function RegistrationField(props: {
  field: ResolvedField;
  config: PublicRegistrationConfig;
}): JSX.Element {
  return (
    <FieldShell fieldRef={props.field.ref} kind={props.field.kind} width={props.field.width}>
      {props.field.kind === FORM_FIELD_KIND.fullName ? (
        <TextField
          fieldRef={props.field.ref}
          label={
            (props.field.kind === FORM_FIELD_KIND.fullName ? props.field.label : null) ??
            props.config.fields.fullNameLabel
          }
          required
          name={FORM_OVERRIDE_KEY.fullName}
          autocomplete="name"
          placeholder={
            (props.field.kind === FORM_FIELD_KIND.fullName ? props.field.placeholder : null) ??
            props.config.fields.fullNamePlaceholder
          }
          help={
            (props.field.kind === FORM_FIELD_KIND.fullName ? props.field.help : null) ??
            props.config.fields.fullNameHelp
          }
          maxLength={200}
          error={props.config.messages.required}
        />
      ) : props.field.kind === FORM_FIELD_KIND.consent ? (
        <qui-field id={domId(props.field.ref)} data-field-ref={props.field.ref} required>
          <qui-checkbox name={FORM_REF_PREFIX.consent} required>
            {(props.field.kind === FORM_FIELD_KIND.consent ? props.field.label : null) ??
              props.config.fields.consentLabel}
          </qui-checkbox>
          <qui-field-helper-text>
            {(props.field.kind === FORM_FIELD_KIND.consent ? props.field.help : null) ??
              props.config.fields.consentHelp}
          </qui-field-helper-text>
          <ErrorText message={props.config.messages.required} />
        </qui-field>
      ) : props.field.kind === FORM_FIELD_KIND.contact ? (
        <ContactField field={props.field} config={props.config} />
      ) : props.field.kind === FORM_FIELD_KIND.mail ? (
        <MailField field={props.field} config={props.config} />
      ) : props.field.kind === FORM_FIELD_KIND.confirmation ? (
        props.field.kind === FORM_FIELD_KIND.confirmation ? (
          <qui-field
            id={domId(props.field.ref)}
            data-field-ref={props.field.ref}
            required={props.field.mode === "required" || undefined}
          >
            <Label
              label={props.config.fields.confirmationLabel}
              required={props.field.mode === "required"}
            />
            <qui-radio-group
              name={FORM_CONFIRMATION_FIELD_NAME}
              required={props.field.mode === "required" || undefined}
              ref={(element: HTMLElement | null) => {
                if (element === null) {
                  return;
                }
                const value =
                  (
                    props.field as Extract<
                      ResolvedField,
                      {
                        kind: typeof FORM_FIELD_KIND.confirmation;
                      }
                    >
                  ).mode === "required"
                    ? ((
                        props.field as Extract<
                          ResolvedField,
                          {
                            kind: typeof FORM_FIELD_KIND.confirmation;
                          }
                        >
                      ).methods[0]?.kind ?? "")
                    : "";
                (
                  element as HTMLElement & {
                    value: string;
                  }
                ).value = value;
              }}
            >
              {props.field.mode === "optional" ? (
                <qui-radio value="">{props.config.fields.confirmationNone}</qui-radio>
              ) : null}
              {props.field.methods.map((method) => (
                <qui-radio key={method.kind} value={method.kind}>
                  {method.label}
                </qui-radio>
              ))}
            </qui-radio-group>
            <qui-field-helper-text>{props.config.fields.confirmationHelp}</qui-field-helper-text>
            <ErrorText message={props.config.messages.confirmationRequired} />
          </qui-field>
        ) : null
      ) : props.field.kind === FORM_FIELD_KIND.ticket ? (
        <TicketField field={props.field} config={props.config} />
      ) : props.field.kind === FORM_FIELD_KIND.custom ? (
        <CustomField field={props.field} config={props.config} />
      ) : props.field.kind === FORM_FIELD_KIND.group ? (
        <GroupField field={props.field} config={props.config} />
      ) : null}
    </FieldShell>
  );
}
export function Section(props: {
  section: ResolvedRegistrationForm["sections"][number];
  config: PublicRegistrationConfig;
}): JSX.Element {
  return (
    <section class={styles.formSection} data-section={props.section.key}>
      <div
        class={vstack({
          alignItems: "stretch",
          gap: "1",
        })}
      >
        <h3 class={styles.sectionTitle}>{props.section.label}</h3>
        {props.section.description !== null ? (
          <p class={styles.sectionDescription}>{props.section.description}</p>
        ) : null}
      </div>
      <div class={styles.fields} data-fields>
        {props.section.fields.map((field) => (
          <RegistrationField key={field.ref} field={field} config={props.config} />
        ))}
      </div>
    </section>
  );
}
