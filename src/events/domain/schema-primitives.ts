import { Type } from "@sinclair/typebox";

import { MAX_FORM_SCHEMA_TEXT_LENGTH } from "~/events/domain/limits";
import { SCHEMA_FORMAT } from "~/events/domain/schema-formats";

export interface LocalizedTextSchemaOptions {
  minProperties?: number;
  maxProperties?: number;
}

/** Create the shared localized-text map schema. */
// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Preserve TypeBox static inference.
export function createLocalizedTextSchema(options: LocalizedTextSchemaOptions = {}) {
  return Type.Record(
    Type.String({ minLength: 2, maxLength: 10, format: SCHEMA_FORMAT.localeKey }),
    Type.String({ minLength: 1, maxLength: MAX_FORM_SCHEMA_TEXT_LENGTH }),
    options,
  );
}

export const localizedTextSchema = createLocalizedTextSchema();
