import { describe, expect, test } from "vitest";

import { can } from "../src/auth/permissions";

describe("role permissions", () => {
  const cases: {
    role: string | null;
    permissions: Parameters<typeof can>[1];
    allowed: boolean;
  }[] = [
    { role: "admin", permissions: { user: ["list"] }, allowed: true },
    { role: "admin", permissions: { event: ["create"] }, allowed: true },
    { role: "admin", permissions: { eventTicket: ["write"] }, allowed: true },
    { role: "event_staff", permissions: { event: ["read"] }, allowed: true },
    { role: "event_staff", permissions: { eventCheckin: ["write"] }, allowed: true },
    { role: "event_staff", permissions: { eventPayment: ["write"] }, allowed: true },
    { role: "event_staff", permissions: { event: ["create"] }, allowed: false },
    { role: "event_staff", permissions: { eventTicket: ["read"] }, allowed: false },
    { role: "event_staff", permissions: { user: ["list"] }, allowed: false },
    { role: "event_checkin", permissions: { eventCheckin: ["write"] }, allowed: true },
    { role: "event_checkin", permissions: { event: ["read"] }, allowed: false },
    { role: "event_checkin", permissions: { eventPayment: ["read"] }, allowed: false },
    { role: "user", permissions: { event: ["read"] }, allowed: false },
    { role: null, permissions: { event: ["read"] }, allowed: false },
    { role: "event_staff,event_checkin", permissions: { eventCheckin: ["write"] }, allowed: true },
  ];

  for (const entry of cases) {
    test(`${entry.role ?? "no role"} -> ${JSON.stringify(entry.permissions)}`, () => {
      expect(can(entry.role, entry.permissions)).toBe(entry.allowed);
    });
  }

  test("admin cannot ban users or change phone numbers", () => {
    expect(can("admin", { user: ["ban"] })).toBe(false);
    expect(can("admin", { user: ["set-phone"] })).toBe(false);
  });
});
