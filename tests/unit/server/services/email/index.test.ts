import { afterEach, describe, expect, test, vi } from "vitest";

import {
  EmailError,
  emailTransport,
  isEmailConfigured,
  sendEmail,
} from "../../../../../src/server/services/email";
import { gmailTransport } from "../../../../../src/server/services/email/gmail";
import { mailtrapTransport } from "../../../../../src/server/services/email/mailtrap";
import type { EmailEnv, EmailMessage } from "../../../../../src/server/services/email/types";

const message: EmailMessage = {
  to: "registrant@example.com",
  subject: "Registration received",
  html: "<p>Hello</p>",
  text: "Hello",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider resolution", () => {
  test.each([
    [undefined, "gmail"],
    ["gmail", "gmail"],
    ["mailtrap", "mailtrap"],
    ["unknown", "gmail"],
  ] as const)("EMAIL_PROVIDER=%s resolves to %s", (provider, expected) => {
    const env: EmailEnv = provider === undefined ? {} : { EMAIL_PROVIDER: provider };

    if (expected === "gmail") {
      expect(emailTransport(env)).toBe(gmailTransport);
    } else {
      expect(emailTransport(env)).toBe(mailtrapTransport);
    }
  });
});

describe("isEmailConfigured", () => {
  test("delegates to the active transport", () => {
    const gmailCheck = vi.spyOn(gmailTransport, "isConfigured").mockReturnValue(true);
    const mailtrapCheck = vi.spyOn(mailtrapTransport, "isConfigured").mockReturnValue(false);

    expect(isEmailConfigured({ EMAIL_PROVIDER: "gmail" })).toBe(true);
    expect(gmailCheck).toHaveBeenCalledTimes(1);
    expect(mailtrapCheck).not.toHaveBeenCalled();

    expect(isEmailConfigured({ EMAIL_PROVIDER: "mailtrap" })).toBe(false);
    expect(mailtrapCheck).toHaveBeenCalledTimes(1);
  });
});

describe("sendEmail", () => {
  test("sends through the active transport when configured", async () => {
    const send = vi.spyOn(gmailTransport, "send").mockResolvedValue(undefined);
    vi.spyOn(gmailTransport, "isConfigured").mockReturnValue(true);
    const env: EmailEnv = { EMAIL_PROVIDER: "gmail" };

    await sendEmail(env, message);

    expect(send).toHaveBeenCalledExactlyOnceWith(env, message);
  });

  test("rejects with an unconfigured EmailError instead of sending", async () => {
    const send = vi.spyOn(mailtrapTransport, "send").mockResolvedValue(undefined);
    vi.spyOn(mailtrapTransport, "isConfigured").mockReturnValue(false);
    const env: EmailEnv = { EMAIL_PROVIDER: "mailtrap" };

    await expect(sendEmail(env, message)).rejects.toMatchObject({
      name: "EmailError",
      provider: "mailtrap",
      message: "email_not_configured",
      status: 0,
      retryable: false,
    });
    expect(send).not.toHaveBeenCalled();

    await expect(sendEmail(env, message)).rejects.toBeInstanceOf(EmailError);
  });
});
