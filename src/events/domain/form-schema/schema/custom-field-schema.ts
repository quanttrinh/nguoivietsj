// @boundary shared
import { type } from "arktype";

import { FORM_CUSTOM_FIELD_TYPE, customRef } from "~/events/domain/form-schema/constants";
import type { FormCustomField } from "~/events/domain/form-schema/types";

// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Preserve ArkType inference.
function textSchema(field: FormCustomField, required: boolean) {
  const minimum = Math.max(field.minLength ?? 0, required ? 1 : 0);
  const maximum = field.maxLength;

  return type("string").narrow(
    (value) => value.length >= minimum && (maximum === undefined || value.length <= maximum),
  );
}

// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Preserve ArkType inference.
function optionSchema(field: FormCustomField) {
  const options = field.options ?? [];

  if (options.length === 0) {
    return type("never");
  }

  const values = options.map((option) => option.value);
  const [first, ...rest] = values;

  if (first === undefined) {
    return type("never");
  }

  return rest.length === 0 ? type.enumerated(first) : type.enumerated(first, ...rest);
}

// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Preserve ArkType inference.
function numberSchema(field: FormCustomField) {
  const minimum = field.min;
  const maximum = field.max;

  return type("number").narrow(
    (value) =>
      (minimum === undefined || value >= minimum) && (maximum === undefined || value <= maximum),
  );
}

// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Preserve ArkType inference.
function fieldValueSchema(field: FormCustomField, required: boolean) {
  switch (field.type) {
    case FORM_CUSTOM_FIELD_TYPE.text:
    case FORM_CUSTOM_FIELD_TYPE.textarea: {
      return textSchema(field, required);
    }
    case FORM_CUSTOM_FIELD_TYPE.number: {
      return numberSchema(field);
    }
    case FORM_CUSTOM_FIELD_TYPE.select:
    case FORM_CUSTOM_FIELD_TYPE.radio: {
      return optionSchema(field);
    }
    case FORM_CUSTOM_FIELD_TYPE.checkbox: {
      return required ? type("true") : type("boolean");
    }
    default: {
      return type("never");
    }
  }
}

/** Build an ArkType schema for the visible custom answers of one form. */
// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Preserve ArkType inference.
export function customFieldAnswersSchema(
  fields: readonly FormCustomField[],
  required: ReadonlyMap<string, boolean>,
) {
  const properties: Record<string, unknown> = {};

  for (const field of fields) {
    const isRequired = required.get(customRef(field.key)) === true;
    properties[isRequired ? field.key : `${field.key}?`] = fieldValueSchema(field, isRequired);
  }

  return type(properties);
}
