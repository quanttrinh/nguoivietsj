import { describe, expect, test } from "vitest";

import { validateEventFormatting } from "../../../src/events/domain/validation";
import { toUtcTimestamp } from "../../../src/shared/utils/datetime";

describe("event formatting validation", () => {
  test("accepts valid timezone and currency", () => {
    expect(validateEventFormatting({ timezone: "America/Toronto", currency: "CAD" })).toEqual([]);
  });

  test("rejects an invalid timezone", () => {
    expect(validateEventFormatting({ timezone: "Not/AZone", currency: "CAD" })).toEqual([
      "timezone",
    ]);
  });

  test("rejects non-ISO currency codes, including three-letter codes Intl accepts", () => {
    expect(validateEventFormatting({ timezone: "UTC", currency: "ABC" })).toEqual([
      "limits.currency",
    ]);
  });
});

describe("event timestamp normalization", () => {
  test("normalizes an offset timestamp to UTC ISO", () => {
    expect(toUtcTimestamp("2026-01-01T10:00:00-05:00")).toBe("2026-01-01T15:00:00.000Z");
  });

  test("keeps an unparseable value for the existing date validator to reject", () => {
    expect(toUtcTimestamp("not-a-date")).toBe("not-a-date");
  });
});
