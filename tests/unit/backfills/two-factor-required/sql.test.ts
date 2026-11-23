import { describe, expect, test } from "vitest";

import { setRequiredSql } from "../../../../src/backfills/two-factor-required";

const EMAIL = "admin@example.com";

describe("two-factor-required backfill", () => {
  test("writes the flag to the matching user", () => {
    const sql = setRequiredSql(EMAIL, false, new Date("2026-01-01T00:00:00Z"));

    expect(sql).toContain('"two_factor_required" = 0');
    expect(sql).toContain(`"email" = '${EMAIL}'`);
  });

  test("can require enrollment again", () => {
    const sql = setRequiredSql(EMAIL, true, new Date("2026-01-01T00:00:00Z"));

    expect(sql).toContain('"two_factor_required" = 1');
  });
});
