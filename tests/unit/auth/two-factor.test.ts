import { describe, expect, test } from "vitest";

import { requiresTwoFactorEnrollment } from "../../../src/auth/two-factor";

describe("requiresTwoFactorEnrollment", () => {
  test("defaults to required when the flag is missing", () => {
    expect(requiresTwoFactorEnrollment({})).toBe(true);
    expect(requiresTwoFactorEnrollment({ twoFactorRequired: null })).toBe(true);
    expect(requiresTwoFactorEnrollment({ twoFactorRequired: true })).toBe(true);
  });

  test("skips enrollment when the flag is disabled", () => {
    expect(requiresTwoFactorEnrollment({ twoFactorRequired: false })).toBe(false);
  });

  test("never sends enrolled users back to enrollment", () => {
    expect(requiresTwoFactorEnrollment({ twoFactorEnabled: true })).toBe(false);
    expect(requiresTwoFactorEnrollment({ twoFactorRequired: true, twoFactorEnabled: true })).toBe(
      false,
    );
    expect(requiresTwoFactorEnrollment({ twoFactorRequired: false, twoFactorEnabled: true })).toBe(
      false,
    );
  });
});
