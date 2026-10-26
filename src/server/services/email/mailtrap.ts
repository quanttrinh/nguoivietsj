// @boundary server
import { coalesceString } from "~/shared/utils/string";

import { EmailError, type EmailEnv, type EmailMessage, type EmailTransport } from "./types";

type MailtrapEnv = Pick<
  EmailEnv,
  "MAILTRAP_API_URL" | "MAILTRAP_API_TOKEN" | "MAILTRAP_FROM_EMAIL" | "MAILTRAP_FROM_NAME"
>;

const MAILTRAP_TIMEOUT_MS = 8000;

class MailtrapError extends EmailError {
  constructor(message: string, status: number, retryable: boolean) {
    super("mailtrap", message, status, retryable);
    this.name = "MailtrapError";
  }
}

/** True when the Mailtrap sending API is configured. */
function isMailtrapConfigured(env: MailtrapEnv): boolean {
  return (
    coalesceString(env.MAILTRAP_API_TOKEN).length > 0 &&
    coalesceString(env.MAILTRAP_API_URL).length > 0 &&
    coalesceString(env.MAILTRAP_FROM_EMAIL).length > 0
  );
}

/** Send a fully rendered email through Mailtrap's sending API. */
async function sendMailtrapMessage(env: MailtrapEnv, email: EmailMessage): Promise<void> {
  if (!isMailtrapConfigured(env)) {
    throw new MailtrapError("mailtrap_not_configured", 0, false);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, MAILTRAP_TIMEOUT_MS);

  try {
    const response = await fetch(coalesceString(env.MAILTRAP_API_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${coalesceString(env.MAILTRAP_API_TOKEN)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: {
          email: coalesceString(env.MAILTRAP_FROM_EMAIL),
          name: coalesceString(env.MAILTRAP_FROM_NAME, "Event registration"),
        },
        to: [{ email: email.to }],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.attachments === undefined ? {} : { attachments: email.attachments }),
      }),
      signal: controller.signal,
    });

    if (response.ok) {
      return;
    }

    const retryable = response.status === 429 || response.status >= 500;

    throw new MailtrapError(
      `Mailtrap rejected the email (${response.status})`,
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

/** Mailtrap transport contract. */
export const mailtrapTransport: EmailTransport = {
  name: "mailtrap",
  isConfigured: isMailtrapConfigured,
  send: sendMailtrapMessage,
};
