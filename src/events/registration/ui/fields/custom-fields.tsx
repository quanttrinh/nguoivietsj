/* oxlint-disable eslint/no-nested-ternary, unicorn/no-nested-ternary, eslint/no-negated-condition, unicorn/no-negated-condition -- Direct schema-driven rendering keeps related options together. */
import type { JSX } from "preact";

import { FORM_CUSTOM_FIELD_TYPE, customRef } from "~/events/domain/form-schema/constants";
import type { ResolvedCustomField } from "~/events/domain/form-schema/resolve/resolve";
import { defaultValueText } from "~/events/domain/presentation";

import type { PublicRegistrationConfig } from "../registration-types";
import { ErrorText, Label, domId } from "./field-primitives";

export function CustomField(props: {
  field: ResolvedCustomField;
  config: PublicRegistrationConfig;
}): JSX.Element {
  const name = (): string => customRef(props.field.key);
  const defaultValue = (): string | undefined =>
    props.field.defaultValue === undefined || props.field.defaultValue === null
      ? undefined
      : defaultValueText(props.field.defaultValue);
  return (
    <qui-field
      id={domId(props.field.ref)}
      data-field-ref={props.field.ref}
      data-custom-type={props.field.type}
      required={props.field.required || undefined}
    >
      {props.field.type === FORM_CUSTOM_FIELD_TYPE.checkbox ? (
        <qui-checkbox
          name={name()}
          required={props.field.required || undefined}
          default-checked={props.field.defaultValue === true}
        >
          {props.field.label}
          {props.field.required ? <qui-field-required-indicator /> : null}
        </qui-checkbox>
      ) : (
        <>
          <Label label={props.field.label} required={props.field.required} />
          {props.field.type === FORM_CUSTOM_FIELD_TYPE.text ? (
            <qui-input
              name={name()}
              placeholder={props.field.placeholder ?? ""}
              min-length={props.field.minLength ?? undefined}
              max-length={props.field.maxLength ?? undefined}
              default-value={defaultValue()}
              required={props.field.required || undefined}
            />
          ) : props.field.type === FORM_CUSTOM_FIELD_TYPE.textarea ? (
            <qui-textarea
              name={name()}
              placeholder={props.field.placeholder ?? ""}
              max-length={props.field.maxLength ?? 4000}
              rows={props.field.rows ?? 4}
              default-value={defaultValue()}
              required={props.field.required || undefined}
            />
          ) : props.field.type === FORM_CUSTOM_FIELD_TYPE.number ? (
            <qui-input
              name={name()}
              input-type="number"
              input-mode-hint="numeric"
              min={props.field.min ?? undefined}
              max={props.field.max ?? undefined}
              step={props.field.step ?? undefined}
              default-value={defaultValue()}
              required={props.field.required || undefined}
            />
          ) : props.field.type === FORM_CUSTOM_FIELD_TYPE.select ? (
            <qui-select
              name={name()}
              placeholder={props.field.placeholder ?? ""}
              required={props.field.required || undefined}
              ref={(element: HTMLElement | null) => {
                const value = defaultValue();
                if (element !== null && value !== undefined) {
                  (
                    element as HTMLElement & {
                      value: string[];
                    }
                  ).value = [value];
                }
              }}
            >
              {props.field.options.map((option) => (
                <qui-option key={option.value} value={option.value}>
                  {option.label}
                </qui-option>
              ))}
            </qui-select>
          ) : props.field.type === FORM_CUSTOM_FIELD_TYPE.radio ? (
            <qui-radio-group
              name={name()}
              required={props.field.required || undefined}
              ref={(element: HTMLElement | null) => {
                if (element !== null) {
                  (
                    element as HTMLElement & {
                      value: string;
                    }
                  ).value = defaultValue() ?? "";
                }
              }}
            >
              {props.field.options.map((option) => (
                <qui-radio key={option.value} value={option.value}>
                  {option.label}
                </qui-radio>
              ))}
            </qui-radio-group>
          ) : null}
        </>
      )}
      {props.field.help !== null ? (
        <qui-field-helper-text>{props.field.help}</qui-field-helper-text>
      ) : null}
      <ErrorText message={props.config.messages.required} />
    </qui-field>
  );
}
