import { afterEach, assert, describe, expect, test, vi, type Mock } from "vitest";

import type {
  EmailEnv,
  EmailMessage,
  EmailAttachment,
} from "../../../../../src/server/services/email/types";

type GmailModule = typeof import("../../../../../src/server/services/email/gmail");

const TOKEN_URL = "https://token.test/oauth";
const SEND_URL = "https://gmail.test/send";
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
    GMAIL_CLIENT_ID: "client-id",
    GMAIL_CLIENT_SECRET: "client-secret",
    GMAIL_REFRESH_TOKEN: "refresh-token",
    GMAIL_SENDER_EMAIL: "events@example.com",
    GMAIL_TOKEN_URL: TOKEN_URL,
    GMAIL_SEND_URL: SEND_URL,
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function nonJson(status: number): Response {
  return new Response("gateway exploded", { status });
}

function loadGmail(): Promise<GmailModule> {
  vi.resetModules();
  return import("../../../../../src/server/services/email/gmail");
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

function rawFromBody(init: RequestInit | undefined): string {
  const body: unknown = requestBody(init);
  assert(typeof body === "object" && body !== null && "raw" in body);
  assert(typeof body.raw === "string");
  return body.raw;
}

function tokenParams(init: RequestInit | undefined): URLSearchParams {
  const body: unknown = init?.body;
  assert(body instanceof URLSearchParams);
  return body;
}

function authorization(init: RequestInit | undefined): unknown {
  const headers: unknown = init?.headers;
  assert(typeof headers === "object" && headers !== null && "Authorization" in headers);
  return headers.Authorization;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("gmail configuration", () => {
  test.for([
    { label: "client id", field: "GMAIL_CLIENT_ID" },
    { label: "client secret", field: "GMAIL_CLIENT_SECRET" },
    { label: "refresh token", field: "GMAIL_REFRESH_TOKEN" },
    { label: "sender email", field: "GMAIL_SENDER_EMAIL" },
  ] as const)("is unconfigured without the $label", async ({ field }) => {
    const { gmailTransport } = await loadGmail();

    expect(gmailTransport.isConfigured(env({ [field]: "" }))).toBe(false);
  });

  test("is configured when all four credentials are present", async () => {
    const { gmailTransport } = await loadGmail();

    expect(gmailTransport.isConfigured(env())).toBe(true);
    expect(gmailTransport.name).toBe("gmail");
  });
});

describe("MIME construction", () => {
  test("sanitizes header injection and encodes non-ASCII display names", async () => {
    const { buildGmailMimeMessage } = await loadGmail();

    const mime = buildGmailMimeMessage({
      fromEmail: "events@example.com",
      fromName: "Người\nBcc: victim@example.com",
      to: "one@example.com\r\nBcc: victim@example.com",
      subject: "Subject\r\nBcc: victim@example.com",
      html: "<b>Hi</b>",
      text: "Hi",
    });

    expect(mime).not.toContain("\nBcc:");
    expect(mime).toContain("To: one@example.com Bcc: victim@example.com");
    expect(mime).toContain("Subject: Subject Bcc: victim@example.com");
    const encodedName = /From: =\?UTF-8\?B\?(?<encoded>[^\s]+)\?= <events@example\.com>/u.exec(
      mime,
    )?.[1];
    expect(encodedName).toBeDefined();
    expect(Buffer.from(encodedName ?? "", "base64").toString()).toBe(
      "Người Bcc: victim@example.com",
    );
  });

  test("uses the bare address when there is no display name", async () => {
    const { buildGmailMimeMessage } = await loadGmail();

    const mime = buildGmailMimeMessage({
      fromEmail: "events@example.com",
      fromName: "   ",
      to: "one@example.com",
      subject: "ASCII subject ✓",
      html: "<b>Hi</b>",
      text: "Hi",
    });

    expect(mime).toContain("From: events@example.com\r\n");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="----=_Part_');
  });

  test("builds alternative text and HTML bodies when there are no attachments", async () => {
    const { buildGmailMimeMessage } = await loadGmail();

    const mime = buildGmailMimeMessage({
      fromEmail: "events@example.com",
      fromName: "Events",
      to: "one@example.com",
      subject: "Hi",
      html: "<b>Hi</b>",
      text: "Hi",
    });

    expect(mime).toContain("From: Events <events@example.com>");
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).toContain(Buffer.from("Hi").toString("base64"));
    expect(mime).not.toContain("multipart/related");
  });

  test.for([
    {
      label: "inline with content id and explicit type",
      attachment: {
        content: "R0lG",
        filename: 'qr"check.gif',
        type: "image/gif",
        disposition: "inline",
        content_id: "qr-check",
      } satisfies EmailAttachment,
      expected: [
        'Content-Type: image/gif; name="qrcheck.gif"',
        "Content-ID: <qr-check>",
        'Content-Disposition: inline; filename="qrcheck.gif"',
      ],
    },
    {
      label: "attachment with default type and disposition",
      attachment: { content: "R0lG", filename: "report\n.pdf" } satisfies EmailAttachment,
      expected: [
        'Content-Type: application/octet-stream; name="report .pdf"',
        'Content-Disposition: attachment; filename="report .pdf"',
      ],
    },
  ])("renders an attachment ($label)", async ({ attachment, expected }) => {
    const { buildGmailMimeMessage } = await loadGmail();

    const mime = buildGmailMimeMessage({
      fromEmail: "events@example.com",
      fromName: "Events",
      to: "one@example.com",
      subject: "Hi",
      html: "<b>Hi</b>",
      text: "Hi",
      attachments: [attachment],
    });

    expect(mime).toContain("Content-Type: multipart/related;");
    for (const line of expected) {
      expect(mime).toContain(line);
    }
    expect(mime).not.toContain("\n.pdf");
  });
});

describe("Gmail transport sends", () => {
  test.for([
    { label: "explicit expiry", token: { access_token: "token-1", expires_in: 600 } },
    { label: "missing expiry", token: { access_token: "token-1" } },
    { label: "invalid expiry", token: { access_token: "token-1", expires_in: "later" } },
  ])("refreshes a token and sends the message ($label)", async ({ token }) => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenResolve(json(token))
      .calledWith(SEND_URL, ANY_INIT)
      .thenResolve(json({ id: "sent" }));

    await gmailTransport.send(env(), message);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokenInit = fetchMock.mock.calls[0]?.[1];
    expect(tokenInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(tokenParams(tokenInit).get("client_id")).toBe("client-id");
    expect(tokenParams(tokenInit).get("grant_type")).toBe("refresh_token");

    const sendInit = fetchMock.mock.calls[1]?.[1];
    expect(sendInit).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer token-1",
        "Content-Type": "application/json",
      },
    });
    expect(authorization(sendInit)).toBe("Bearer token-1");
    expect(Buffer.from(rawFromBody(sendInit), "base64url").toString()).toContain(
      "Subject: Registration received",
    );
  });

  test("includes attachments in the MIME message sent to Gmail", async () => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenResolve(json({ access_token: "token-1" }))
      .calledWith(SEND_URL, ANY_INIT)
      .thenResolve(json({ id: "sent" }));

    await gmailTransport.send(env(), {
      ...message,
      attachments: [{ content: "R0lG", filename: "qr.gif", type: "image/gif" }],
    });

    const mime = Buffer.from(rawFromBody(fetchMock.mock.calls[1]?.[1]), "base64url").toString();
    expect(mime).toContain("multipart/related");
    expect(mime).toContain('filename="qr.gif"');
  });

  test("reuses the cached token for a second send", async () => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenResolve(json({ access_token: "cached-token" }))
      .calledWith(SEND_URL, ANY_INIT)
      .thenResolve(json({ id: "sent" }));

    await gmailTransport.send(env(), message);
    await gmailTransport.send(env(), message);

    expect(fetchMock.mock.calls.filter(([url]) => url === TOKEN_URL)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === SEND_URL)).toHaveLength(2);
  });

  test("shares one in-flight token refresh between concurrent sends", async () => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    const { promise: pendingToken, resolve: resolveToken } = Promise.withResolvers<Response>();
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenReturn(pendingToken)
      .calledWith(SEND_URL, ANY_INIT)
      .thenResolve(json({ id: "sent" }));

    const first = gmailTransport.send(env(), message);
    const second = gmailTransport.send(env(), message);
    resolveToken(json({ access_token: "shared-token" }));
    await Promise.all([first, second]);

    expect(fetchMock.mock.calls.filter(([url]) => url === TOKEN_URL)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url === SEND_URL)).toHaveLength(2);
  });

  test("forces a token refresh and retries after a 401", async () => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenResolve(json({ access_token: "fallback-token" }))
      .thenResolveOnce(json({ access_token: "first-token" }))
      .calledWith(SEND_URL, ANY_INIT)
      .thenResolve(json({ id: "sent" }))
      .thenResolveOnce(json({ error: "unauthorized" }, 401));

    await gmailTransport.send(env(), message);

    expect(fetchMock.mock.calls.filter(([url]) => url === TOKEN_URL)).toHaveLength(2);
    const sendCalls = fetchMock.mock.calls.filter(([url]) => url === SEND_URL);
    expect(sendCalls.map(([, init]) => authorization(init))).toEqual([
      "Bearer first-token",
      "Bearer fallback-token",
    ]);
  });

  test("rejects before any HTTP call when credentials are missing", async () => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();

    await expect(
      gmailTransport.send(env({ GMAIL_SENDER_EMAIL: "" }), message),
    ).rejects.toMatchObject({
      name: "GmailError",
      provider: "gmail",
      message: "gmail_not_configured",
      status: 0,
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects when the token response contains no access token", async () => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    vi.when(fetchMock).calledWith(TOKEN_URL, ANY_INIT).thenResolve(json({}));

    await expect(gmailTransport.send(env(), message)).rejects.toMatchObject({
      name: "GmailError",
      message: "gmail_access_token_missing",
      status: 0,
      retryable: true,
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === SEND_URL)).toHaveLength(0);
  });

  test("treats invalid_grant as a permanent token failure", async () => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenResolve(json({ error: "invalid_grant" }, 400));

    await expect(gmailTransport.send(env(), message)).rejects.toMatchObject({
      name: "GmailError",
      message: "gmail_refresh_token_invalid",
      status: 400,
      retryable: false,
    });
  });

  test.for([
    {
      label: "plain 400",
      status: 400,
      body: { error: "bad request" },
      expected: "Gmail token refresh failed (400)",
      retryable: false,
    },
    {
      label: "unstructured 400",
      status: 400,
      body: {},
      expected: "Gmail token refresh failed (400)",
      retryable: false,
    },
    {
      label: "server error with non-JSON body",
      status: 500,
      body: "not json",
      expected: "Gmail token refresh failed (500)",
      retryable: true,
    },
  ])("maps token endpoint failures ($label)", async ({ status, body, expected, retryable }) => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenResolve(typeof body === "string" ? nonJson(status) : json(body, status));

    await expect(gmailTransport.send(env(), message)).rejects.toMatchObject({
      name: "GmailError",
      message: expected,
      retryable,
    });
  });

  test.for([
    { label: "rate limit", status: 429, body: {}, retryable: true },
    { label: "server error with non-JSON body", status: 503, body: "down", retryable: true },
    {
      label: "403 quota",
      status: 403,
      body: { error: { errors: [{ reason: "quotaExceeded" }] } },
      retryable: true,
    },
    {
      label: "403 permission",
      status: 403,
      body: { error: { errors: [{ reason: "forbidden" }] } },
      retryable: false,
    },
    { label: "403 without reason", status: 403, body: { error: {} }, retryable: false },
    {
      label: "validation error",
      status: 422,
      body: { error: { errors: [{ reason: "invalid" }] } },
      retryable: false,
    },
  ])("classifies send failures ($label)", async ({ status, body, retryable }) => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenResolve(json({ access_token: "token-1" }))
      .calledWith(SEND_URL, ANY_INIT)
      .thenResolve(typeof body === "string" ? nonJson(status) : json(body, status));

    await expect(gmailTransport.send(env(), message)).rejects.toMatchObject({
      name: "GmailError",
      message: `Gmail rejected the email (${status})`,
      status,
      retryable,
    });
  });

  test("aborts the pending request when the timeout callback fires", async () => {
    const { gmailTransport } = await loadGmail();
    const fetchMock = stubFetch();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    vi.when(fetchMock)
      .calledWith(TOKEN_URL, ANY_INIT)
      .thenResolve(json({ access_token: "token-1" }))
      .calledWith(SEND_URL, ANY_INIT)
      .thenResolve(json({ id: "sent" }));

    await gmailTransport.send(env(), message);

    const sendSignal = fetchMock.mock.calls.find(([url]) => url === SEND_URL)?.[1]?.signal;
    const timeoutCallback = setTimeoutSpy.mock.calls.at(-1)?.[0];
    expect(typeof timeoutCallback).toBe("function");
    if (typeof timeoutCallback === "function") {
      timeoutCallback();
    }
    expect(sendSignal?.aborted).toBe(true);
  });
});
