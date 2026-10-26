import { describe, expect, test } from "vitest";

import { isRegistrationPaid } from "../src/events/domain/payment";

describe("isRegistrationPaid", () => {
  test("treats a zero-due registration as paid", () => {
    expect(isRegistrationPaid(null, 0)).toBe(true);
  });

  test("requires a covering payment", () => {
    expect(isRegistrationPaid(null, 500)).toBe(false);
    expect(isRegistrationPaid({ amountMinor: 499 }, 500)).toBe(false);
    expect(isRegistrationPaid({ amountMinor: 500 }, 500)).toBe(true);
    expect(isRegistrationPaid({ amountMinor: 600 }, 500)).toBe(true);
  });
});
