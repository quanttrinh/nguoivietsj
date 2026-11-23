// @boundary client
import type { JSX } from "preact";

import { FORM_CUSTOM_FIELD_TYPE, customRef } from "~/events/domain/form-schema/constants";
import type { ResolvedCustomField } from "~/events/domain/form-schema/resolve/resolve";
import { defaultValueText } from "~/events/domain/presentation";
import { stripNulishProps } from "~/shared/client/strip-props";

import type { FieldProps } from "./field-types";
import { FieldFrame } from "./FieldPrimitives";

type CustomFieldProps = FieldProps<ResolvedCustomField>;

interface CustomControlProps {
  field: ResolvedCustomField;
  name: string;
  defaultValue: string | undefined;
  required: boolean;
}

function CustomCheckbox({
  field,
  name,
  required,
}: {
  field: ResolvedCustomField;
  name: string;
  required: boolean;
}) {
  return (
    <qui-checkbox name={name} required={required} defaultChecked={field.defaultValue === true}>
      {field.label}
      {required ? <qui-field-required-indicator /> : null}
    </qui-checkbox>
  );
}

function CustomControl({
  field,
  name,
  defaultValue,
  required,
}: CustomControlProps): JSX.Element | null {
  if (field.type === FORM_CUSTOM_FIELD_TYPE.text) {
    return (
      <qui-input
        name={name}
        placeholder={field.placeholder ?? ""}
        defaultValue={defaultValue ?? ""}
        required={required}
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
        name={name}
        placeholder={field.placeholder ?? ""}
        maxLength={field.maxLength ?? 4000}
        rows={field.rows ?? 4}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
    );
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.number) {
    return (
      <qui-input
        name={name}
        inputType="number"
        inputModeHint="numeric"
        defaultValue={defaultValue ?? ""}
        required={required}
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
        name={name}
        placeholder={field.placeholder ?? ""}
        required={required}
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
      <qui-radio-group name={name} required={required} defaultValue={defaultValue ?? ""}>
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

export function CustomField({ field, config, required, error }: CustomFieldProps): JSX.Element {
  const name = customRef(field.key);
  const defaultValue =
    field.defaultValue == null ? undefined : defaultValueText(field.defaultValue);
  const checkbox = field.type === FORM_CUSTOM_FIELD_TYPE.checkbox;

  return (
    <FieldFrame
      fieldRef={field.ref}
      label={checkbox ? null : field.label}
      required={required}
      help={field.help}
      error={error}
      fallbackError={config.labels.errors.required}
      customType={field.type}
    >
      {checkbox ? (
        <CustomCheckbox field={field} name={name} required={required} />
      ) : (
        <CustomControl field={field} name={name} defaultValue={defaultValue} required={required} />
      )}
    </FieldFrame>
  );
}
