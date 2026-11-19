import { describe, expect, test } from "vitest";

import { seedFormSchemas } from "../../../../src/backfills/seed";
import { formSchemaSchema } from "../../../../src/events/domain/form-schema/schema/schema";
import { expectSchema } from "../../helpers/assertions";

describe("seed fixtures", () => {
  for (const { slug, schema } of seedFormSchemas()) {
    test(`${slug} has a valid form schema`, () => {
      expectSchema(schema, formSchemaSchema);
      expect(schema.version).toBe(4);
    });
  }
});
