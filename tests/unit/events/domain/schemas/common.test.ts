import { type } from "arktype";
import { describe, expect, test } from "vitest";

import { LIMITS } from "~/features/events/domain/limits";
import { unknownRecordSchema } from "~/features/events/domain/schemas/common";

describe("unknownRecordSchema", () => {
  test("rejects keys longer than the configured bound", () => {
    const key = "x".repeat(LIMITS.text.jsonKey + 1);

    expect(unknownRecordSchema({ [key]: "value" }) instanceof type.errors).toBe(true);
    const withinBound = { ["x".repeat(LIMITS.text.jsonKey)]: "value" };

    expect(unknownRecordSchema(withinBound) instanceof type.errors).toBe(false);
  });
});
