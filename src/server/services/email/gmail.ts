// @boundary server
import { coalesceString } from "~/shared/utils/string";

import { toBase64, toBase64Url, wrapBase64 } from "./encoding";
import {
  EmailError,
  type EmailAttachment,
  type EmailEnv,
  type EmailMessage,
  type EmailTransport,
} from "./types";

const GMAIL_TIMEOUT_MS = 8000;
const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

class GmailError extends EmailError {
  constructor(message: string, status: number, retryable: boolean) {
    super("gmail", message, status, retryable);
    this.name = "GmailError";
  }
}

interface CachedAccessToken {
  value: string;
  expiresAt: number;
}

let cachedAccessToken: CachedAccessToken | undefined;
let refreshInFlight: Promise<string> | undefined;

/** True when the Gmail sender and OAuth credentials are configured. */
function isGmailConfigured(env: EmailEnv): boolean {
  return (
    coalesceString(env.GMAIL_CLIENT_ID).length > 0 &&
    coalesceString(env.GMAIL_CLIENT_SECRET).length > 0 &&
    coalesceString(env.GMAIL_REFRESH_TOKEN).length > 0 &&
    coalesceString(env.GMAIL_SENDER_EMAIL).length > 0
  );
}

function sanitizeHeader(value: string): string {
  return value.replaceAll(/[\r\n]+/gu, " ").trim();
}

function encodeHeader(value: string): string {
  const safe = sanitizeHeader(value);

  if (/^[\u0020-\u007E]*$/u.test(safe)) {
    return safe;
  }

  return `=?UTF-8?B?${toBase64(new TextEncoder().encode(safe))}?=`;
}

function formatAddress(name: string, email: string): string {
  const address = sanitizeHeader(email);
  const displayName = sanitizeHeader(name);

  if (displayName.length === 0) {
    return address;
  }

  return `${encodeHeader(displayName)} <${address}>`;
}

function mimeBoundary(): string {
  return `----=_Part_${crypto.randomUUID()}`;
}

function textPart(content: string, contentType: string): string {
  return [
    `Content-Type: ${contentType}; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(toBase64(new TextEncoder().encode(content))),
  ].join("\r\n");
}

function attachmentPart(attachment: EmailAttachment): string {
  const filename = sanitizeHeader(attachment.filename).replaceAll('"', "");
  const contentType = sanitizeHeader(attachment.type ?? "application/octet-stream");
  const disposition = attachment.disposition ?? "attachment";
  const headers = [
    `Content-Type: ${contentType}; name="${filename}"`,
    `Content-Disposition: ${disposition}; filename="${filename}"`,
    "Content-Transfer-Encoding: base64",
  ];

  if (attachment.content_id !== undefined) {
    headers.splice(2, 0, `Content-ID: <${sanitizeHeader(attachment.content_id)}>`);
  }

  return [...headers, "", wrapBase64(attachment.content)].join("\r\n");
}

interface GmailMimeInput {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

/** Build the RFC 2822 MIME message that Gmail expects in `messages.send.raw`. */
export function buildGmailMimeMessage(input: GmailMimeInput): string {
  const hasAttachments = (input.attachments?.length ?? 0) > 0;
  const outerBoundary = mimeBoundary();
  const alternativeBoundary = mimeBoundary();
  const headers = [
    `From: ${formatAddress(input.fromName, input.fromEmail)}`,
    `To: ${sanitizeHeader(input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];
  const body: string[] = [];

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/related; boundary="${outerBoundary}"`);
    body.push(
      `--${outerBoundary}`,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      "",
      `--${alternativeBoundary}`,
      textPart(input.text, "text/plain"),
      `--${alternativeBoundary}`,
      textPart(input.html, "text/html"),
      `--${alternativeBoundary}--`,
    );

    for (const attachment of input.attachments ?? []) {
      body.push(`--${outerBoundary}`, attachmentPart(attachment));
    }

    body.push(`--${outerBoundary}--`);
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${outerBoundary}"`);
    body.push(
      `--${outerBoundary}`,
      textPart(input.text, "text/plain"),
      `--${outerBoundary}`,
      textPart(input.html, "text/html"),
      `--${outerBoundary}--`,
    );
  }

  return [...headers, "", ...body, ""].join("\r\n");
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, GMAIL_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function responseError(response: Response, prefix: string): Promise<GmailError> {
  let reason = "";

  try {
    const body = await response.json<{
      error?: { status?: unknown; errors?: { reason?: unknown }[] };
    }>();
    const firstReason = body.error?.errors?.[0]?.reason;
    reason = typeof firstReason === "string" ? firstReason : "";
  } catch {
    // Gmail occasionally returns a non-JSON error body.
  }

  const retryable =
    retryableStatus(response.status) ||
    (response.status === 403 && /rate|quota|backend|unavailable/iu.test(reason));

  return new GmailError(`${prefix} (${response.status})`, response.status, retryable);
}

function invalidateAccessToken(): void {
  cachedAccessToken = undefined;
}

async function requestAccessToken(env: EmailEnv): Promise<string> {
  const body = new URLSearchParams({
    client_id: coalesceString(env.GMAIL_CLIENT_ID),
    client_secret: coalesceString(env.GMAIL_CLIENT_SECRET),
    refresh_token: coalesceString(env.GMAIL_REFRESH_TOKEN),
    grant_type: "refresh_token",
  });
  const response = await fetchWithTimeout(coalesceString(env.GMAIL_TOKEN_URL, DEFAULT_TOKEN_URL), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const parsed = await response.json<{ error?: unknown }>();
      detail = typeof parsed.error === "string" ? parsed.error : "";
    } catch {
      // Ignore malformed error bodies.
    }

    if (response.status === 400 && detail === "invalid_grant") {
      throw new GmailError("gmail_refresh_token_invalid", response.status, false);
    }

    throw await responseError(response, "Gmail token refresh failed");
  }

  const parsed = await response.json<{ access_token?: unknown; expires_in?: unknown }>();
  const token = typeof parsed.access_token === "string" ? parsed.access_token : "";
  const expiresIn = typeof parsed.expires_in === "number" ? parsed.expires_in : 3600;

  if (token.length === 0) {
    throw new GmailError("gmail_access_token_missing", 0, true);
  }

  cachedAccessToken = {
    value: token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };

  return token;
}

async function getAccessToken(env: EmailEnv, force = false): Promise<string> {
  if (force) {
    invalidateAccessToken();
  }

  if (cachedAccessToken !== undefined && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.value;
  }

  if (refreshInFlight !== undefined) {
    return refreshInFlight;
  }

  const pending = requestAccessToken(env);
  refreshInFlight = pending;

  try {
    return await pending;
  } finally {
    if (refreshInFlight === pending) {
      refreshInFlight = undefined;
    }
  }
}

async function sendRaw(env: EmailEnv, raw: string): Promise<void> {
  const send = (token: string): Promise<Response> =>
    fetchWithTimeout(coalesceString(env.GMAIL_SEND_URL, DEFAULT_SEND_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

  let response = await send(await getAccessToken(env));

  if (response.status === 401) {
    response = await send(await getAccessToken(env, true));
  }

  if (response.ok) {
    return;
  }

  throw await responseError(response, "Gmail rejected the email");
}

/** Send a transactional email through Gmail's messages.send endpoint. */
async function sendGmailMessage(env: EmailEnv, message: EmailMessage): Promise<void> {
  if (!isGmailConfigured(env)) {
    throw new GmailError("gmail_not_configured", 0, false);
  }

  const fromEmail = coalesceString(env.GMAIL_SENDER_EMAIL);
  const fromName = coalesceString(env.GMAIL_SENDER_NAME, "Event registration");
  const mime = buildGmailMimeMessage({
    fromEmail,
    fromName,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.attachments === undefined ? {} : { attachments: message.attachments }),
  });

  await sendRaw(env, toBase64Url(new TextEncoder().encode(mime)));
}

/** Gmail transport contract. */
export const gmailTransport: EmailTransport = {
  name: "gmail",
  isConfigured: isGmailConfigured,
  send: sendGmailMessage,
};
