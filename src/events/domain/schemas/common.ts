// @boundary shared
import { type } from "arktype";

import { SUPPORTED_LOCALES } from "~/shared/constants/locales";

import { LIMITS } from "../limits";

/** A JSON object with bounded keys and arbitrary values. */
export const unknownRecordSchema = type
  .Record(type.string, "unknown")
  .narrow((value) => Object.keys(value).every((key) => key.length <= LIMITS.text.jsonKey));

const localizedTextValueSchema = type(`1 <= string <= ${LIMITS.form.text}`);

/**
 * Localized strings keyed by a supported locale.
 *
 * ArkType requires enumerated keys to be declared as named properties, so the
 * record is validated as a string-keyed map and then narrowed to the locale set.
 */
export const localizedTextSchema = type
  .Record(type.string, localizedTextValueSchema)
  .narrow((value) => Object.keys(value).every((key) => SUPPORTED_LOCALES.has(key)));
export type LocalizedText = typeof localizedTextSchema.infer;

export const localizedTextOrNullSchema = localizedTextSchema.or(type("null"));

export const emailSchema = type(`1 <= string.email <= ${LIMITS.text.email}`);

export const urlSchema = type(`1 <= string.url <= ${LIMITS.event.url}`);

/** Build a bounded string schema that must also match a regular expression. */
export function patternStringSchema(pattern: RegExp, max: number, min = 1) {
  return type(`${min} <= string <= ${max}`).narrow((value) => pattern.test(value));
}

const parsedTimestampSchema = type("string.date.parse").pipe((date) => date.toISOString());

export const nullableTimestampSchema = parsedTimestampSchema.or(type("null"));

export const uuidV7Schema = type("string.uuid.v7");
