import { afterEach, assert, describe, expect, test, vi, type Mock } from "vitest";

import { mailtrapProvider } from "../../../../../src/server/services/email/mailtrap";
import type {
  DirectEmail,
  EmailEnv,
  TemplateEmail,
} from "../../../../../src/server/services/email/types";

const API_URL = "https://mailtrap.test/api/send";
// Vitest types its asymmetric matchers as `any`; they are safe as deep-equality matchers here.
// oxlint-disable-next-line typescript/no-unsafe-assignment
const ANY_INIT: RequestInit = expect.anything();

const templateMessage: TemplateEmail = {
  type: "template",
  from: { email: "events", name: "Test Events" },
  to: [{ email: "registrant@example.com" }],
  templateId: "registration-template",
  variables: {
    full_name: "Ada Lovelace",
    registration_id: "0199e2c0-7a1f-7000-8000-123456789abc",
    amount_due: 5000,
  },
};

const directMessage: DirectEmail = {
  type: "direct",
  from: { email: "events", name: "Test Events" },
  to: [{ email: "registrant@example.com" }],
  subject: "Your registration",
  html: "<p>Hello Ada</p>",
  text: "Hello Ada",
};

function env(overrides: Partial<EmailEnv> = {}): EmailEnv {
  return {
    MAILTRAP_API_TOKEN: "api-token",
    MAILTRAP_API_URL: API_URL,
    ...overrides,
  };
}

function stubFetch(): Mock<typeof fetch> {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(init: RequestInit | undefined): unknown {
  const body: unknown = init?.body;
  assert(typeof body === "string");
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mailtrap configuration", () => {
  test.for([
    { label: "API token", field: "MAILTRAP_API_TOKEN" },
    { label: "API URL", field: "MAILTRAP_API_URL" },
  ] as const)("is unconfigured without the $label", ({ field }) => {
    expect(mailtrapProvider.isConfigured(env({ [field]: "" }))).toBe(false);
  });

  test("is configured when the generic Mailtrap settings are present", () => {
    expect(mailtrapProvider.isConfigured(env())).toBe(true);
  });

  test("reports its capabilities and name", () => {
    expect(mailtrapProvider.name).toBe("mailtrap");
    expect(mailtrapProvider.capabilities).toEqual({
      templates: true,
      direct: true,
      attachments: true,
    });
  });

  test("rejects before any HTTP call when configuration is missing", async () => {
    const fetchMock = stubFetch();

    await expect(
      mailtrapProvider.send(env({ MAILTRAP_API_TOKEN: "" }), templateMessage),
    ).rejects.toMatchObject({
      name: "MailtrapError",
      message: "mailtrap_not_configured",
      status: 0,
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Mailtrap template payloads", () => {
  test("composes the sender address from the Worker origin and bound identity", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("__WORKER_ORIGIN__", "https://nguoivietsj.ca");
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), templateMessage);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(API_URL);
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer api-token",
        "Content-Type": "application/json",
      },
    });
    const body = requestBody(init);
    expect(body).toMatchObject({
      from: { email: "events@nguoivietsj.ca", name: "Test Events" },
      to: [{ email: "registrant@example.com" }],
      template_uuid: "registration-template",
      template_variables: {
        full_name: "Ada Lovelace",
        registration_id: "0199e2c0-7a1f-7000-8000-123456789abc",
        amount_due: 5000,
      },
    });
    for (const key of ["subject", "html", "text"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  test("uses a fallback display name when the bound name is empty", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("__WORKER_ORIGIN__", "https://nguoivietsj.ca");
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), {
      ...templateMessage,
      from: { email: "events", name: "" },
    });

    expect(requestBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      from: { email: "events@nguoivietsj.ca", name: "Event registration" },
    });
  });

  test("forwards the bound sender identity and attachments", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("__WORKER_ORIGIN__", "https://nguoivietsj.ca");
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), {
      ...templateMessage,
      from: { email: "no-reply", name: "Người Việt SJ" },
      attachments: [{ content: "R0lG", filename: "qr.gif", type: "image/gif" }],
    });

    expect(requestBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      from: { email: "no-reply@nguoivietsj.ca", name: "Người Việt SJ" },
      template_uuid: "registration-template",
      attachments: [{ content: "R0lG", filename: "qr.gif", type: "image/gif" }],
    });
  });

  test("uses localhost when the injected worker origin is absent", async () => {
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), templateMessage);

    expect(requestBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      from: { email: "events@localhost", name: "Test Events" },
    });
  });

  test("uses localhost when the injected worker origin is not a valid URL", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("__WORKER_ORIGIN__", "not a url");
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), templateMessage);

    expect(requestBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      from: { email: "events@localhost", name: "Test Events" },
    });
  });
});

describe("Mailtrap direct payloads", () => {
  test("sends the subject, html and optional text", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("__WORKER_ORIGIN__", "https://nguoivietsj.ca");
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), directMessage);

    expect(requestBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      from: { email: "events@nguoivietsj.ca", name: "Test Events" },
      to: [{ email: "registrant@example.com" }],
      subject: "Your registration",
      html: "<p>Hello Ada</p>",
      text: "Hello Ada",
    });
    expect(requestBody(fetchMock.mock.calls[0]?.[1])).not.toHaveProperty("template_uuid");
  });

  test("omits text and attachments when they are absent", async () => {
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), {
      type: "direct",
      from: { email: "events", name: "Test Events" },
      to: [{ email: "registrant@example.com" }],
      subject: "Your registration",
      html: "<p>Hello Ada</p>",
    });

    const body = requestBody(fetchMock.mock.calls[0]?.[1]);
    expect(body).not.toHaveProperty("text");
    expect(body).not.toHaveProperty("attachments");
    expect(body).toMatchObject({ subject: "Your registration", html: "<p>Hello Ada</p>" });
  });

  test("forwards direct attachments", async () => {
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), {
      ...directMessage,
      attachments: [{ content: "R0lG", filename: "qr.gif", disposition: "inline" }],
    });

    expect(requestBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      attachments: [{ content: "R0lG", filename: "qr.gif", disposition: "inline" }],
    });
  });
});

describe("Mailtrap responses and failures", () => {
  test.for([
    { label: "rate limit", status: 429, retryable: true },
    { label: "server failure", status: 500, retryable: true },
    { label: "validation failure", status: 422, retryable: false },
    { label: "authentication failure", status: 401, retryable: false },
  ])("marks a $status response as retryable=$retryable ($label)", async ({ status, retryable }) => {
    const fetchMock = stubFetch();
    vi.when(fetchMock).calledWith(API_URL, ANY_INIT).thenResolve(new Response(null, { status }));

    await expect(mailtrapProvider.send(env(), templateMessage)).rejects.toMatchObject({
      name: "MailtrapError",
      message: `Mailtrap rejected the email (${status})`,
      status,
      retryable,
    });
  });

  test("wraps network errors as retryable Mailtrap errors", async () => {
    const fetchMock = stubFetch();
    vi.when(fetchMock).calledWith(API_URL, ANY_INIT).thenReject(new Error("network down"));

    await expect(mailtrapProvider.send(env(), templateMessage)).rejects.toMatchObject({
      name: "MailtrapError",
      message: "network down",
      status: 0,
      retryable: true,
    });
  });

  test("uses a fallback message for non-Error rejections", async () => {
    const fetchMock = stubFetch();
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- verify non-Error rejections are wrapped.
    vi.when(fetchMock).calledWith(API_URL, ANY_INIT).thenReject("offline");

    await expect(mailtrapProvider.send(env(), templateMessage)).rejects.toMatchObject({
      name: "MailtrapError",
      message: "Mailtrap request failed",
      status: 0,
      retryable: true,
    });
  });

  test("aborts the pending request when the timeout callback fires", async () => {
    const fetchMock = stubFetch();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapProvider.send(env(), directMessage);

    const timeoutCallback = setTimeoutSpy.mock.calls.at(-1)?.[0];
    expect(typeof timeoutCallback).toBe("function");
    if (typeof timeoutCallback === "function") {
      timeoutCallback();
    }
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
