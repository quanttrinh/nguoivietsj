import { describe, expect, test } from "vitest";

import { CONTACT_FIELD_REFS, parseRef } from "~/features/events/domain/form-schema/refs";

describe("parseRef", () => {
  test.each([
    ["custom.note", { kind: "custom", key: "note" }],
    ["group.choices", { kind: "group", key: "choices" }],
    ["ticket.general", { kind: "ticketCondition", key: "general" }],
    ["system.tickets.general", { kind: "ticketField", key: "general" }],
    ["contact.email", { kind: "contactCondition", contact: "email" }],
    [CONTACT_FIELD_REFS.email, { kind: "contactField", ref: CONTACT_FIELD_REFS.email }],
    ["system.fullName", { kind: "static", ref: "system.fullName" }],
    ["system.consent", { kind: "static", ref: "system.consent" }],
    ["unsupported.ref", { kind: "unknown", ref: "unsupported.ref" }],
    ["contact.unknown", { kind: "unknown", ref: "contact.unknown" }],
  ] as const)("classifies %s", (ref, expected) => {
    expect(parseRef(ref)).toEqual(expected);
  });

  test("handles empty dynamic keys explicitly", () => {
    expect(parseRef("custom.")).toEqual({ kind: "custom", key: "" });
    expect(parseRef("group.")).toEqual({ kind: "group", key: "" });
    expect(parseRef("contact.")).toEqual({ kind: "unknown", ref: "contact." });
  });

  test("distinguishes consent condition from the static system ref", () => {
    expect(parseRef("consent")).toEqual({ kind: "consentCondition" });
    expect(parseRef("system.consent").kind).toBe("static");
  });
});
