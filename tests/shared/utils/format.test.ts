import { describe, expect, test } from "vitest";

import {
  dateFormatter,
  dateTimeFormatter,
  formatMoney,
  moneyFormatter,
} from "../../../src/shared/utils/format";

describe("format helpers", () => {
  test("cache formatters by locale and time zone", () => {
    expect(dateFormatter("en", "UTC")).toBe(dateFormatter("en", "UTC"));
    expect(dateTimeFormatter("en", "UTC")).toBe(dateTimeFormatter("en", "UTC"));
    expect(moneyFormatter("en", "CAD")).toBe(moneyFormatter("en", "CAD"));
  });

  test("do not throw for an invalid time zone or locale", () => {
    expect(() => dateTimeFormatter("en", "Not/AZone").format(new Date())).not.toThrow();
    expect(() => dateTimeFormatter("not a locale", "UTC").format(new Date())).not.toThrow();
  });

  test("fall back to a decimal formatter for a malformed currency code", () => {
    expect(moneyFormatter("en", "US").resolvedOptions().style).toBe("decimal");
    expect(formatMoney(123, "en", "US")).toContain("US");
  });
});
