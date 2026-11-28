import { describe, expect, test } from "vitest";

import {
  REGISTRATION_RETENTION_MONTHS,
  registrationRetentionCutoff,
} from "~/features/events/server/services/maintenance";

describe("registration retention cutoff", () => {
  test("uses a three-month retention window", () => {
    expect(REGISTRATION_RETENTION_MONTHS).toBe(3);
  });

  test("subtracts three calendar months and preserves the time of day", () => {
    expect(registrationRetentionCutoff(new Date("2027-06-15T12:34:56.789Z"))).toBe(
      "2027-03-15T12:34:56.789Z",
    );
  });

  test("clamps end-of-month dates instead of expiring data early", () => {
    expect(registrationRetentionCutoff(new Date("2027-05-31T12:00:00.000Z"))).toBe(
      "2027-02-28T12:00:00.000Z",
    );
  });

  test("handles February in a leap year", () => {
    expect(registrationRetentionCutoff(new Date("2028-05-31T12:00:00.000Z"))).toBe(
      "2028-02-29T12:00:00.000Z",
    );
  });
});
