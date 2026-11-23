import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const isConfigured = vi.fn<() => boolean>();
  const sendTemplate =
    vi.fn<
      (name: string, to: string, variables: Record<string, string | number>) => Promise<void>
    >();
  return {
    isConfigured,
    sendTemplate,
    createEmailSender:
      vi.fn<
        (
          env: unknown,
          templates: Record<string, string>,
          from: { local: string; name: string },
        ) => { isConfigured: typeof isConfigured; sendTemplate: typeof sendTemplate }
      >(),
  };
});

vi.mock("~/server/services/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/services/email")>();
  return { ...actual, createEmailSender: mocks.createEmailSender };
});

const { isEventEmailConfigured } = await import("../../../../src/events/services/email");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createEmailSender.mockReturnValue({
    isConfigured: mocks.isConfigured,
    sendTemplate: mocks.sendTemplate,
  });
});

describe("event email binding", () => {
  test("binds event template UUIDs and the events sender identity", () => {
    const env = {
      MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED: "reg-template",
      MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED: "pay-template",
      MAILTRAP_TEMPLATE_STATUS_OTP: "otp-template",
    };
    mocks.isConfigured.mockReturnValue(true);

    expect(isEventEmailConfigured(env)).toBe(true);
    expect(mocks.createEmailSender).toHaveBeenCalledExactlyOnceWith(
      env,
      {
        registrationReceived: "reg-template",
        paymentConfirmed: "pay-template",
        statusOtp: "otp-template",
      },
      { local: "events", name: "Người Việt SJ Events" },
    );
  });

  test("falls back to empty template values while keeping the code-defined identity", () => {
    mocks.isConfigured.mockReturnValue(false);

    expect(isEventEmailConfigured({})).toBe(false);
    expect(mocks.createEmailSender).toHaveBeenCalledExactlyOnceWith(
      {},
      { registrationReceived: "", paymentConfirmed: "", statusOtp: "" },
      { local: "events", name: "Người Việt SJ Events" },
    );
  });
});
