import { describe, expect, test } from "vitest";

import { answerFieldsFromSchema } from "~/features/events/server/services/registration-answer-fields";
import { seedFormSchemas } from "~/platform/jobs/backfills/seed";

const schema = seedFormSchemas()[0]?.schema;

describe("answerFieldsFromSchema", () => {
  test("shares a single frozen array across equal-schema cache hits", () => {
    expect.assert(schema !== undefined, "expected a seeded form schema");

    const first = answerFieldsFromSchema(schema);
    const second = answerFieldsFromSchema({ ...schema });

    expect(first.length).toBeGreaterThan(0);
    expect(Object.isFrozen(first)).toBe(true);
    expect(second).toBe(first);
  });

  test("accepts a stable version key so callers can skip JSON.stringify", () => {
    expect.assert(schema !== undefined, "expected a seeded form schema");

    const byVersion = answerFieldsFromSchema(schema, "evt-1:7");
    const byVersionAgain = answerFieldsFromSchema({ ...schema }, "evt-1:7");

    expect(byVersion.length).toBeGreaterThan(0);
    expect(byVersionAgain).toBe(byVersion);
  });
});
