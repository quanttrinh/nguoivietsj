import { Type, type TSchema } from "@sinclair/typebox";

import { FORM_CUSTOM_FIELD_TYPE, customRef } from "~/events/domain/form-schema/constants";
import type { FormCustomField } from "~/events/domain/form-schema/types";

function textSchema(field: FormCustomField, required: boolean): TSchema {
  const minimum = Math.max(field.minLength ?? 0, required ? 1 : 0);

  return Type.String({
    ...(minimum > 0 ? { minLength: minimum } : {}),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
  });
}

function optionSchema(field: FormCustomField): TSchema {
  const options = field.options ?? [];

  return options.length === 0
    ? Type.Never()
    : Type.Union(options.map((option) => Type.Literal(option.value)));
}

function fieldValueSchema(field: FormCustomField, required: boolean): TSchema {
  switch (field.type) {
    case FORM_CUSTOM_FIELD_TYPE.text:
    case FORM_CUSTOM_FIELD_TYPE.textarea: {
      return textSchema(field, required);
    }
    case FORM_CUSTOM_FIELD_TYPE.number: {
      return Type.Number({
        ...(field.min === undefined ? {} : { minimum: field.min }),
        ...(field.max === undefined ? {} : { maximum: field.max }),
      });
    }
    case FORM_CUSTOM_FIELD_TYPE.select:
    case FORM_CUSTOM_FIELD_TYPE.radio: {
      return optionSchema(field);
    }
    case FORM_CUSTOM_FIELD_TYPE.checkbox: {
      return required ? Type.Literal(true) : Type.Boolean();
    }
    default: {
      return Type.Never();
    }
  }
}

/** Build a TypeBox schema for the visible custom answers of one form. */
export function customFieldAnswersSchema(
  fields: readonly FormCustomField[],
  required: ReadonlyMap<string, boolean>,
): TSchema {
  const properties: Record<string, TSchema> = {};

  for (const field of fields) {
    const isRequired = required.get(customRef(field.key)) === true;
    const valueSchema = fieldValueSchema(field, isRequired);
    properties[field.key] = isRequired ? valueSchema : Type.Optional(valueSchema);
  }

  return Type.Object(properties, { additionalProperties: false });
}
