import { afterEach, assert, describe, expect, test, vi, type Mock } from "vitest";

import {
  createEmailSender,
  EmailError,
  isEmailConfigured,
  registerEmailProvider,
  registeredEmailProviders,
  type EmailAttachment,
  type EmailCapabilities,
  type EmailEnv,
  type EmailFrom,
  type EmailProvider,
} from "~/platform/server/email";

import { expectEmailError } from "../../../helpers/email";

type Template = "registrationReceived" | "paymentConfirmed";

const ALL_CAPABILITIES: EmailCapabilities = {
  templates: true,
  direct: true,
  attachments: true,
};

function fakeProvider(
  name: string,
  capabilities: EmailCapabilities,
  configured = true,
): { provider: EmailProvider; send: Mock<EmailProvider["send"]> } {
  const send = vi.fn<EmailProvider["send"]>().mockResolvedValue(undefined);
  const provider: EmailProvider = {
    name,
    capabilities,
    isConfigured: vi.fn<EmailProvider["isConfigured"]>().mockReturnValue(configured),
    send,
  };
  registerEmailProvider(provider);
  return { provider, send };
}

const capture = fakeProvider("test-capture", ALL_CAPABILITIES);
fakeProvider("test-no-direct", {
  templates: true,
  direct: false,
  attachments: true,
});
fakeProvider("test-no-attachments", {
  templates: true,
  direct: true,
  attachments: false,
});
fakeProvider("test-no-templates", {
  templates: false,
  direct: true,
  attachments: true,
});
fakeProvider("test-unconfigured", ALL_CAPABILITIES, false);

function env(overrides: Partial<EmailEnv> = {}): EmailEnv {
  return {
    EMAIL_PROVIDER: "mailtrap",
    MAILTRAP_API_TOKEN: "api-token",
    MAILTRAP_API_URL: "https://mailtrap.test/api/send",
    ...overrides,
  };
}

const templates: Readonly<Record<Template, string>> = {
  registrationReceived: "registration-template",
  paymentConfirmed: "payment-template",
};

const from: EmailFrom = { local: "events", name: "Test Events" };

function requestBody(init: RequestInit | undefined): unknown {
  const body: unknown = init?.body;
  assert(typeof body === "string");
  return JSON.parse(body);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("isEmailConfigured", () => {
  test("reflects the resolved provider's configuration", () => {
    expect(isEmailConfigured(env())).toBe(true);
    expect(isEmailConfigured(env({ MAILTRAP_API_TOKEN: "" }))).toBe(false);
    expect(isEmailConfigured(env({ MAILTRAP_API_URL: "" }))).toBe(false);
    expect(isEmailConfigured(env({ EMAIL_PROVIDER: "test-capture" }))).toBe(true);
  });

  test("fails when provider resolution is ambiguous", () => {
    expect(() => {
      isEmailConfigured({});
    }).toThrow(EmailError);
    expect(() => {
      isEmailConfigured({});
    }).toThrow(/email_provider_ambiguous/u);
  });
});

describe("createEmailSender", () => {
  test("is configured only when the provider and every bound template are configured", () => {
    expect(createEmailSender(env(), templates, from).isConfigured()).toBe(true);
    expect(createEmailSender(env({ MAILTRAP_API_TOKEN: "" }), templates, from).isConfigured()).toBe(
      false,
    );
    expect(
      createEmailSender(env(), { ...templates, paymentConfirmed: "" }, from).isConfigured(),
    ).toBe(false);
    expect(
      createEmailSender(
        env({ EMAIL_PROVIDER: "test-unconfigured" }),
        templates,
        from,
      ).isConfigured(),
    ).toBe(false);
  });

  test("sends a bound template with the composed sender address", async () => {
    const selected = env({ EMAIL_PROVIDER: "test-capture" });

    await createEmailSender(selected, templates, from).sendTemplate(
      "registrationReceived",
      "registrant@example.com",
      { full_name: "Ada Lovelace", amount_due: 5000 },
    );

    expect(capture.send).toHaveBeenCalledExactlyOnceWith(selected, {
      type: "template",
      from: { email: "events", name: "Test Events" },
      to: [{ email: "registrant@example.com" }],
      templateId: "registration-template",
      variables: { full_name: "Ada Lovelace", amount_due: 5000 },
    });
  });

  test("passes template attachments through to the provider", async () => {
    const selected = env({ EMAIL_PROVIDER: "test-capture" });
    const attachments: EmailAttachment[] = [
      { content: "R0lG", filename: "qr.gif", type: "image/gif" },
    ];

    await createEmailSender(selected, templates, from).sendTemplate(
      "paymentConfirmed",
      "registrant@example.com",
      { amount: 5000 },
      attachments,
    );

    expect(capture.send).toHaveBeenCalledExactlyOnceWith(selected, {
      type: "template",
      from: { email: "events", name: "Test Events" },
      to: [{ email: "registrant@example.com" }],
      templateId: "payment-template",
      variables: { amount: 5000 },
      attachments,
    });
  });

  test("sends a direct email with subject, html, text and attachments", async () => {
    const selected = env({ EMAIL_PROVIDER: "test-capture" });
    const attachments: EmailAttachment[] = [{ content: "R0lG", filename: "qr.gif" }];

    await createEmailSender(selected, templates, from).sendDirect("registrant@example.com", {
      subject: "Welcome",
      html: "<p>Hello</p>",
      text: "Hello",
      attachments,
    });

    expect(capture.send).toHaveBeenCalledExactlyOnceWith(selected, {
      type: "direct",
      from: { email: "events", name: "Test Events" },
      to: [{ email: "registrant@example.com" }],
      subject: "Welcome",
      html: "<p>Hello</p>",
      text: "Hello",
      attachments,
    });
  });

  test("omits absent optional fields in a direct email", async () => {
    const selected = env({ EMAIL_PROVIDER: "test-capture" });

    await createEmailSender(selected, templates, from).sendDirect("registrant@example.com", {
      subject: "Welcome",
      html: "<p>Hello</p>",
    });

    expect(capture.send).toHaveBeenCalledExactlyOnceWith(selected, {
      type: "direct",
      from: { email: "events", name: "Test Events" },
      to: [{ email: "registrant@example.com" }],
      subject: "Welcome",
      html: "<p>Hello</p>",
    });
  });

  test("sends through the default Mailtrap provider when it is selected", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("__WORKER_ORIGIN__", "https://nguoivietsj.ca");

    await createEmailSender(env(), templates, from).sendTemplate(
      "registrationReceived",
      "registrant@example.com",
      { full_name: "Ada Lovelace" },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      from: { email: "events@nguoivietsj.ca", name: "Test Events" },
      template_uuid: "registration-template",
      template_variables: { full_name: "Ada Lovelace" },
    });
  });

  test("rejects template sends when the provider is not configured", async () => {
    const selected = env({ EMAIL_PROVIDER: "test-unconfigured" });

    await expect(
      createEmailSender(selected, templates, from).sendTemplate(
        "registrationReceived",
        "to@example.com",
        {},
      ),
    ).rejects.toMatchObject({
      name: "EmailError",
      message: "email_not_configured",
      status: 0,
      retryable: false,
    });
    await expect(
      createEmailSender(selected, templates, from).sendDirect("to@example.com", {
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    ).rejects.toMatchObject({ message: "email_not_configured" });
    expect(capture.send).not.toHaveBeenCalled();
  });

  test("rejects when the bound template UUID is missing", async () => {
    await expect(
      createEmailSender(
        env({ EMAIL_PROVIDER: "test-capture" }),
        { ...templates, registrationReceived: "" },
        from,
      ).sendTemplate("registrationReceived", "to@example.com", {}),
    ).rejects.toMatchObject({
      name: "EmailError",
      message: "email_template_not_configured",
      status: 0,
      retryable: false,
    });
    expect(capture.send).not.toHaveBeenCalled();
  });

  test("rejects a provider without template support at bind time", () => {
    expectEmailError(() => {
      createEmailSender(env({ EMAIL_PROVIDER: "test-no-templates" }), templates, from);
    }, "email_templates_unsupported");
  });

  test("rejects direct sends when the provider lacks direct support", async () => {
    const selected = env({ EMAIL_PROVIDER: "test-no-direct" });

    await expect(
      createEmailSender(selected, templates, from).sendDirect("to@example.com", {
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    ).rejects.toMatchObject({
      name: "EmailError",
      message: "email_direct_unsupported",
      status: 0,
      retryable: false,
    });
  });

  test("rejects sends with attachments when the provider lacks attachment support", async () => {
    const selected = env({ EMAIL_PROVIDER: "test-no-attachments" });
    const attachments: EmailAttachment[] = [{ content: "R0lG", filename: "qr.gif" }];

    await expect(
      createEmailSender(selected, templates, from).sendTemplate(
        "registrationReceived",
        "to@example.com",
        {},
        attachments,
      ),
    ).rejects.toMatchObject({ message: "email_attachments_unsupported" });
    await expect(
      createEmailSender(selected, templates, from).sendDirect("to@example.com", {
        subject: "Welcome",
        html: "<p>Hello</p>",
        attachments,
      }),
    ).rejects.toMatchObject({ message: "email_attachments_unsupported" });
  });

  test("rejects an unknown provider at bind time", () => {
    expectEmailError(() => {
      createEmailSender(env({ EMAIL_PROVIDER: "missing" }), templates, from);
    }, "email_provider_unknown: missing");
  });

  test("rejects an ambiguous provider selection at bind time", () => {
    const selected = env();
    delete selected.EMAIL_PROVIDER;

    expectEmailError(
      () => {
        createEmailSender(selected, templates, from);
      },
      `email_provider_ambiguous: ${registeredEmailProviders()
        .map((entry) => entry.name)
        .join(", ")}`,
    );
  });

  test("rejects with a real EmailError for provider failures", async () => {
    await expect(
      createEmailSender(env({ MAILTRAP_API_TOKEN: "" }), templates, from).sendTemplate(
        "registrationReceived",
        "to@example.com",
        {},
      ),
    ).rejects.toBeInstanceOf(EmailError);
  });
});
