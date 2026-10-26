export type MailtrapTemplateVariables = Record<string, string | number | boolean>;

export interface MailtrapAttachment {
  content: string;
  filename: string;
  type?: string;
  disposition?: "attachment" | "inline";
  content_id?: string;
}

export interface MailtrapTemplateEmail {
  to: string;
  templateUuid: string;
  variables: MailtrapTemplateVariables;
  attachments?: MailtrapAttachment[];
}

export type MailtrapEnv = Pick<
  Env,
  | "MAILTRAP_API_URL"
  | "MAILTRAP_API_TOKEN"
  | "MAILTRAP_FROM_EMAIL"
  | "MAILTRAP_FROM_NAME"
  | "MAILTRAP_REGISTRATION_TEMPLATE_UUID"
  | "MAILTRAP_PAYMENT_TEMPLATE_UUID"
  | "MAILTRAP_STATUS_OTP_TEMPLATE_UUID"
>;

export const MAILTRAP_TIMEOUT_MS = 8000;

export class MailtrapError extends Error {
  public readonly status: number;
  public readonly retryable: boolean;

  public constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "MailtrapError";
    this.status = status;
    this.retryable = retryable;
  }
}

/** True when the Mailtrap sending API is configured. */
export function isMailtrapConfigured(env: MailtrapEnv): boolean {
  return (
    (env.MAILTRAP_API_TOKEN ?? "").trim().length > 0 &&
    (env.MAILTRAP_API_URL ?? "").trim().length > 0 &&
    (env.MAILTRAP_FROM_EMAIL ?? "").trim().length > 0
  );
}

/** True when a Mailtrap-hosted template UUID is configured. */
export function isMailtrapTemplateConfigured(templateUuid: string): boolean {
  return templateUuid.trim().length > 0;
}

async function sendOnce(
  env: MailtrapEnv,
  email: MailtrapTemplateEmail,
  templateUuid: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, MAILTRAP_TIMEOUT_MS);

  try {
    const response = await fetch(env.MAILTRAP_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MAILTRAP_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: {
          email: env.MAILTRAP_FROM_EMAIL,
          name: env.MAILTRAP_FROM_NAME ?? "Event registration",
        },
        to: [{ email: email.to }],
        template_uuid: templateUuid,
        template_variables: email.variables,
        ...(email.attachments === undefined ? {} : { attachments: email.attachments }),
      }),
      signal: controller.signal,
    });

    if (response.ok) {
      return;
    }

    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;

    throw new MailtrapError(
      `Mailtrap rejected the email (${response.status}): ${body.slice(0, 500)}`,
      response.status,
      retryable,
    );
  } catch (error) {
    if (error instanceof MailtrapError) {
      throw error;
    }

    throw new MailtrapError(
      error instanceof Error ? error.message : "Mailtrap request failed",
      0,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Send a transactional email rendered from a Mailtrap-hosted template. */
export async function sendTemplateEmail(
  env: MailtrapEnv,
  email: MailtrapTemplateEmail,
): Promise<void> {
  if (!isMailtrapConfigured(env)) {
    throw new MailtrapError("mailtrap_not_configured", 0, false);
  }

  const templateUuid = email.templateUuid.trim();

  if (!isMailtrapTemplateConfigured(templateUuid)) {
    throw new MailtrapError("mailtrap_template_not_configured", 0, false);
  }

  await sendOnce(env, email, templateUuid);
}

/** Encode binary content as base64 for Mailtrap attachments. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
