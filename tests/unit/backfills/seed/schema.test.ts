import { describe, expect, test } from "vitest";

import { formSchemaSchema } from "~/features/events/domain/form-schema/schema/schema";
import { seedFormSchemas } from "~/platform/jobs/backfills/seed";

import { expectSchema } from "../../helpers/assertions";

describe("seed fixtures", () => {
  for (const { slug, schema } of seedFormSchemas()) {
    test(`${slug} has a valid form schema`, () => {
      expectSchema(schema, formSchemaSchema);
      expect(schema.version).toBe(4);
    });
  }
});
