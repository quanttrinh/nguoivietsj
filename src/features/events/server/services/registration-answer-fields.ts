// @boundary server
import { type } from "arktype";

import { formSchemaSchema } from "~/features/events/domain/form-schema/schema/schema";
import type { LocalizedText } from "~/features/events/domain/types";

/** Minimal field metadata needed to label a registration's custom answers. */
export interface AnswerFieldView {
  key: string;
  label: LocalizedText;
  type: string;
}

/**
 * D1 hands back a fresh object for every read, so object identity is useless as
 * a cache key: the stable JSON serialization of the immutable stored schema is
 * used instead. The cap bounds memory to the small set of published versions.
 */
const ANSWER_FIELDS_CACHE_LIMIT = 128;
const answerFieldsCache = new Map<string, readonly AnswerFieldView[]>();

function remember(key: string, fields: AnswerFieldView[]): readonly AnswerFieldView[] {
  // Callers only serialize these fields, so share one frozen array instead of
  // copying it on every cache hit.
  const shared = Object.freeze(fields);
  answerFieldsCache.set(key, shared);

  if (answerFieldsCache.size > ANSWER_FIELDS_CACHE_LIMIT) {
    const oldest = answerFieldsCache.keys().next().value;

    if (oldest !== undefined) {
      answerFieldsCache.delete(oldest);
    }
  }

  return shared;
}

/**
 * Extract answer field labels from a stored form schema using the canonical
 * schema validator, tolerating invalid schemas by returning an empty list.
 */
export function answerFieldsFromSchema(
  schema: Record<string, unknown>,
): readonly AnswerFieldView[] {
  const cacheKey = JSON.stringify(schema);
  const cached = answerFieldsCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const result = formSchemaSchema(schema);

  if (result instanceof type.errors) {
    return remember(cacheKey, []);
  }

  const fields: AnswerFieldView[] = (result.customFields ?? []).map((field) => ({
    key: field.key,
    label: field.label,
    type: field.type,
  }));

  return remember(cacheKey, fields);
}
