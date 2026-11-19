import { afterEach, assert, describe, expect, test, vi, type Mock } from "vitest";

import { mailtrapTransport } from "../../../../../src/server/services/email/mailtrap";
import type { EmailEnv, EmailMessage } from "../../../../../src/server/services/email/types";

const API_URL = "https://mailtrap.test/api/send";
// Vitest types its asymmetric matchers as `any`; they are safe as deep-equality matchers here.
// oxlint-disable-next-line typescript/no-unsafe-assignment
const ANY_INIT: RequestInit = expect.anything();

const message: EmailMessage = {
  to: "registrant@example.com",
  subject: "Registration received",
  html: "<p>Hello</p>",
  text: "Hello",
};

function env(overrides: Partial<EmailEnv> = {}): EmailEnv {
  return {
    MAILTRAP_API_TOKEN: "api-token",
    MAILTRAP_API_URL: API_URL,
    MAILTRAP_FROM_EMAIL: "events@example.com",
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
    { label: "from email", field: "MAILTRAP_FROM_EMAIL" },
  ] as const)("is unconfigured without the $label", ({ field }) => {
    expect(mailtrapTransport.isConfigured(env({ [field]: "" }))).toBe(false);
  });

  test("is configured when token, URL, and sender are present", () => {
    expect(mailtrapTransport.isConfigured(env())).toBe(true);
    expect(mailtrapTransport.name).toBe("mailtrap");
  });

  test("rejects before any HTTP call when configuration is missing", async () => {
    const fetchMock = stubFetch();

    await expect(
      mailtrapTransport.send(env({ MAILTRAP_API_TOKEN: "" }), message),
    ).rejects.toMatchObject({
      name: "MailtrapError",
      provider: "mailtrap",
      message: "mailtrap_not_configured",
      status: 0,
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Mailtrap send requests", () => {
  test("posts a rendered message with the default sender name", async () => {
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));

    await mailtrapTransport.send(env(), message);

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
    expect(requestBody(init)).toEqual({
      from: { email: "events@example.com", name: "Event registration" },
      to: [{ email: "registrant@example.com" }],
      subject: "Registration received",
      html: "<p>Hello</p>",
      text: "Hello",
    });
  });

  test("forwards the configured sender name and attachments", async () => {
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(API_URL, ANY_INIT)
      .thenResolve(new Response(null, { status: 200 }));
    const withAttachment: EmailMessage = {
      ...message,
      attachments: [{ content: "R0lG", filename: "qr.gif", type: "image/gif" }],
    };

    await mailtrapTransport.send(env({ MAILTRAP_FROM_NAME: "Người Việt SJ" }), withAttachment);

    expect(requestBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      from: { email: "events@example.com", name: "Người Việt SJ" },
      attachments: [{ content: "R0lG", filename: "qr.gif", type: "image/gif" }],
    });
  });

  test.for([
    { label: "rate limit", status: 429, retryable: true },
    { label: "server failure", status: 500, retryable: true },
    { label: "validation failure", status: 422, retryable: false },
    { label: "authentication failure", status: 401, retryable: false },
  ])("marks a $status response as retryable=$retryable ($label)", async ({ status, retryable }) => {
    const fetchMock = stubFetch();
    vi.when(fetchMock).calledWith(API_URL, ANY_INIT).thenResolve(new Response(null, { status }));

    await expect(mailtrapTransport.send(env(), message)).rejects.toMatchObject({
      name: "MailtrapError",
      provider: "mailtrap",
      message: `Mailtrap rejected the email (${status})`,
      status,
      retryable,
    });
  });

  test("wraps network errors as retryable Mailtrap errors", async () => {
    const fetchMock = stubFetch();
    vi.when(fetchMock).calledWith(API_URL, ANY_INIT).thenReject(new Error("network down"));

    await expect(mailtrapTransport.send(env(), message)).rejects.toMatchObject({
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

    await expect(mailtrapTransport.send(env(), message)).rejects.toMatchObject({
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

    await mailtrapTransport.send(env(), message);

    const timeoutCallback = setTimeoutSpy.mock.calls.at(-1)?.[0];
    expect(typeof timeoutCallback).toBe("function");
    if (typeof timeoutCallback === "function") {
      timeoutCallback();
    }
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
