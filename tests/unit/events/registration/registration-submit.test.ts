import { describe, expect, test, vi } from "vitest";

import type { RegistrationPayload } from "~/features/events/registration/ui/form/registration-form-state";
import {
  postRegistration,
  type RegistrationErrorMessages,
} from "~/features/events/registration/ui/form/registration-submit";

function testMessages(): RegistrationErrorMessages {
  return {
    required: "msg:required",
    fullName: "msg:fullName",
    fullNameInvalid: "msg:fullNameInvalid",
    email: "msg:email",
    phone: "msg:phone",
    postalCode: "msg:postalCode",
    atLeastOneContact: "msg:atLeastOneContact",
    atLeastOneTicket: "msg:atLeastOneTicket",
    ticketLimit: "msg:ticketLimit",
    ticketTypeLimit: "msg:ticketTypeLimit",
    eventCapacity: "msg:eventCapacity",
    duplicate: "msg:duplicate",
    confirmationRequired: "msg:confirmationRequired",
    confirmationContact: "msg:confirmationContact",
    confirmationMultiple: "msg:confirmationMultiple",
    confirmationNotAllowed: "msg:confirmationNotAllowed",
    duplicateContact: "msg:duplicateContact",
    invalidValue: "msg:invalidValue",
    ticketUnavailable: "msg:ticketUnavailable",
    groupOneOf: "msg:groupOneOf",
    groupAtLeastOne: "msg:groupAtLeastOne",
    groupAllOf: "msg:groupAllOf",
    invalidNumber: "msg:invalidNumber",
    invalidOption: "msg:invalidOption",
    submit: "msg:submit",
    invalidPayload: "msg:invalidPayload",
    rateLimited: "msg:rateLimited",
    turnstile: "msg:turnstile",
    errorTitle: "msg:errorTitle",
    warningTitle: "msg:warningTitle",
    staffWarning: "msg:staffWarning",
    staffConfirm: "msg:staffConfirm",
  };
}

const payload: RegistrationPayload = {
  fullName: "Test Attendee",
  contacts: [],
  tickets: [{ key: "general", quantity: 1 }],
  consent: true,
  formVersion: 1,
  turnstileToken: "",
  answers: {},
  metadata: { locale: "en", source: "web" },
};

function errorResponse(body: unknown, status = 400): Response {
  return Response.json(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(body: unknown, status = 400) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(errorResponse(body, status));
}

describe("registration submission failure mapping", () => {
  test("maps issues from the API error envelope into field errors", async () => {
    mockFetch({
      status: "error",
      data: null,
      error: {
        code: "event_invalid_payload",
        message: "Invalid registration data",
        issues: [
          { ref: "contact.email", code: "invalid_email" },
          { ref: "custom.company", code: "required" },
        ],
      },
      meta: {},
    });

    const result = await postRegistration("demo", payload, testMessages());

    expect(result.status).toBe("issues");
    if (result.status !== "issues") {
      return;
    }

    expect(result.errors).toEqual({
      "contact.email": "msg:email",
      "custom.company": "msg:required",
    });
    expect(result.first).toEqual({ ref: "contact.email", code: "invalid_email" });
    expect(result.message).toBe("msg:email");
    expect(result.issues).toEqual([
      { code: "invalid_email", ref: "contact.email", message: "msg:email" },
      { code: "required", ref: "custom.company", message: "msg:required" },
    ]);
  });

  test("ignores malformed issues but keeps valid ones from the envelope", async () => {
    mockFetch({
      status: "error",
      data: null,
      error: {
        code: "event_invalid_payload",
        issues: [{ ref: "contact.email", code: "invalid_email" }, { code: "required" }],
      },
      meta: {},
    });

    const result = await postRegistration("demo", payload, testMessages());

    expect(result.status).toBe("issues");
    if (result.status !== "issues") {
      return;
    }
    expect(result.errors).toEqual({ "contact.email": "msg:email" });
  });

  test("surfaces envelope fields while preserving the server message", async () => {
    mockFetch({
      status: "error",
      data: null,
      error: {
        code: "event_invalid_payload",
        message: "Please select at least one ticket",
        fields: ["tickets"],
      },
      meta: {},
    });

    const result = await postRegistration("demo", payload, testMessages());

    expect(result.status).toBe("issues");
    if (result.status !== "issues") {
      return;
    }
    expect(result.errors).toEqual({ tickets: "msg:invalidValue" });
    expect(result.message).toBe("msg:invalidValue");
  });

  test("falls back to the generic submit message when no details are present", async () => {
    mockFetch({
      status: "error",
      data: null,
      error: { code: "event_registration_closed" },
      meta: {},
    });

    const result = await postRegistration("demo", payload, testMessages());

    expect(result).toEqual({ status: "error", message: "msg:submit" });
  });
});
