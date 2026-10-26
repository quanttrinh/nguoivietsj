// @boundary client
import { type JSX } from "preact";

import { FORM_CUSTOM_FIELD_TYPE, customRef } from "~/events/domain/form-schema/constants";
import { type ResolvedCustomField } from "~/events/domain/form-schema/resolve/resolve";
import { defaultValueText } from "~/events/domain/presentation";
import { stripNulishProps } from "~/shared/client/strip-props";

import { type FieldProps } from "./field-types";
import { FieldFrame } from "./FieldPrimitives";

export type CustomFieldProps = FieldProps<ResolvedCustomField>;

interface CustomControlProps {
  field: ResolvedCustomField;
  name: string;
  defaultValue: string | undefined;
  required: boolean;
}

function CustomCheckbox(props: {
  field: ResolvedCustomField;
  name: string;
  required: boolean;
}): JSX.Element {
  return (
    <qui-checkbox
      name={props.name}
      required={props.required}
      defaultChecked={props.field.defaultValue === true}
    >
      {props.field.label}
      {props.required ? <qui-field-required-indicator /> : null}
    </qui-checkbox>
  );
}

function CustomControl(props: CustomControlProps): JSX.Element | null {
  const { field } = props;
  const defaultValue = props.defaultValue;

  if (field.type === FORM_CUSTOM_FIELD_TYPE.text) {
    return (
      <qui-input
        name={props.name}
        placeholder={field.placeholder ?? ""}
        defaultValue={defaultValue ?? ""}
        required={props.required}
        {...stripNulishProps({
          minLength: field.minLength,
          maxLength: field.maxLength,
        })}
      />
    );
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.textarea) {
    return (
      <qui-textarea
        name={props.name}
        placeholder={field.placeholder ?? ""}
        maxLength={field.maxLength ?? 4000}
        rows={field.rows ?? 4}
        defaultValue={defaultValue ?? ""}
        required={props.required}
      />
    );
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.number) {
    return (
      <qui-input
        name={props.name}
        inputType="number"
        inputModeHint="numeric"
        defaultValue={defaultValue ?? ""}
        required={props.required}
        {...stripNulishProps({
          min: field.min,
          max: field.max,
          step: field.step,
        })}
      />
    );
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.select) {
    return (
      <qui-select
        name={props.name}
        placeholder={field.placeholder ?? ""}
        required={props.required}
        defaultValue={defaultValue === undefined ? [] : [defaultValue]}
      >
        {field.options.map((option) => (
          <qui-option key={option.value} value={option.value}>
            {option.label}
          </qui-option>
        ))}
      </qui-select>
    );
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.radio) {
    return (
      <qui-radio-group
        name={props.name}
        required={props.required}
        defaultValue={defaultValue ?? ""}
      >
        {field.options.map((option) => (
          <qui-radio key={option.value} value={option.value}>
            {option.label}
          </qui-radio>
        ))}
      </qui-radio-group>
    );
  }

  return null;
}

export function CustomField(props: CustomFieldProps): JSX.Element {
  const { field } = props;
  const name = customRef(field.key);
  const defaultValue =
    field.defaultValue == null ? undefined : defaultValueText(field.defaultValue);
  const checkbox = field.type === FORM_CUSTOM_FIELD_TYPE.checkbox;

  return (
    <FieldFrame
      fieldRef={field.ref}
      label={checkbox ? null : field.label}
      required={props.required}
      help={field.help}
      error={props.error}
      fallbackError={props.config.messages.required}
      customType={field.type}
    >
      {checkbox ? (
        <CustomCheckbox field={field} name={name} required={props.required} />
      ) : (
        <CustomControl
          field={field}
          name={name}
          defaultValue={defaultValue}
          required={props.required}
        />
      )}
    </FieldFrame>
  );
}
