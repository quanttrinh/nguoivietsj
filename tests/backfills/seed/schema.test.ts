import { type } from "arktype";
import { describe, expect, test } from "vitest";

import { seedFormSchemas } from "../../../src/backfills/seed";
import { formSchemaSchema } from "../../../src/events/domain/form-schema/schema/schema";

describe("seed fixtures", () => {
  for (const { slug, schema } of seedFormSchemas()) {
    test(`${slug} has a valid form schema`, () => {
      const result = formSchemaSchema(schema);

      if (result instanceof type.errors) {
        throw new TypeError(result.summary);
      }

      expect(result.version).toBe(4);
    });
  }
});
