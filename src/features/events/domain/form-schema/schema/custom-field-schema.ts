// @boundary shared
import { type } from "arktype";

import { FORM_CUSTOM_FIELD_TYPE, customRef } from "~/features/events/domain/form-schema/constants";
import type { FormCustomField } from "~/features/events/domain/form-schema/types";

/**
 * Upper bound on cached compiled validators. Custom fields are immutable once
 * a form version is written, so signatures repeat across registrations; the
 * cap keeps long-lived processes from retaining every historical form shape.
 */
const VALIDATOR_CACHE_LIMIT = 256;

function compileAnswersSchema(properties: Record<string, unknown>) {
  return type(properties);
}

type CompiledAnswersSchema = ReturnType<typeof compileAnswersSchema>;

const compiledSchemas = new Map<string, CompiledAnswersSchema>();

/** Stable signature of everything that affects answer validation. */
function answerSchemaSignature(
  fields: readonly FormCustomField[],
  required: ReadonlyMap<string, boolean>,
) {
  return JSON.stringify(
    fields.map((field) => [
      field.key,
      field.type,
      required.get(customRef(field.key)) === true,
      field.minLength ?? null,
      field.maxLength ?? null,
      field.min ?? null,
      field.max ?? null,
      (field.options ?? []).map((option) => option.value),
    ]),
  );
}

function textSchema(field: FormCustomField, required: boolean) {
  const minimum = Math.max(field.minLength ?? 0, required ? 1 : 0);
  const maximum = field.maxLength;

  return type("string").narrow(
    (value) => value.length >= minimum && (maximum === undefined || value.length <= maximum),
  );
}

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

function numberSchema(field: FormCustomField) {
  const minimum = field.min;
  const maximum = field.max;

  return type("number").narrow(
    (value) =>
      (minimum === undefined || value >= minimum) && (maximum === undefined || value <= maximum),
  );
}

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
export function customFieldAnswersSchema(
  fields: readonly FormCustomField[],
  required: ReadonlyMap<string, boolean>,
) {
  const signature = answerSchemaSignature(fields, required);
  const cached = compiledSchemas.get(signature);

  if (cached !== undefined) {
    return cached;
  }

  const properties: Record<string, unknown> = {};

  for (const field of fields) {
    const isRequired = required.get(customRef(field.key)) === true;
    properties[isRequired ? field.key : `${field.key}?`] = fieldValueSchema(field, isRequired);
  }

  const compiled = compileAnswersSchema(properties);

  if (compiledSchemas.size >= VALIDATOR_CACHE_LIMIT) {
    const oldest = compiledSchemas.keys().next().value;

    if (oldest !== undefined) {
      compiledSchemas.delete(oldest);
    }
  }

  compiledSchemas.set(signature, compiled);
  return compiled;
}
