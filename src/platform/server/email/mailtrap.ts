// @boundary server
import { coalesceString } from "~/platform/utils/string";

import { EmailError, type EmailEnv, type EmailMessage, type EmailProvider } from "./types";

const MAILTRAP_TIMEOUT_MS = 8000;

/** Public hostname of the active Worker, derived from the injected origin. */
function workerHostname() {
  // The `typeof` guard keeps unit tests safe when the global is not injected.
  const origin = typeof __WORKER_ORIGIN__ === "string" ? __WORKER_ORIGIN__ : "http://localhost";

  try {
    return new URL(origin).hostname;
  } catch {
    return "localhost";
  }
}

class MailtrapError extends EmailError {
  constructor(message: string, status: number, retryable: boolean) {
    super(message, status, retryable);
    this.name = "MailtrapError";
  }
}

function isConfigured(env: EmailEnv) {
  return (
    coalesceString(env.MAILTRAP_API_TOKEN).length > 0 &&
    coalesceString(env.MAILTRAP_API_URL).length > 0
  );
}

async function send(env: EmailEnv, message: EmailMessage) {
  if (!isConfigured(env)) {
    throw new MailtrapError("mailtrap_not_configured", 0, false);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, MAILTRAP_TIMEOUT_MS);

  const common = {
    from: {
      email: `${message.from.email}@${workerHostname()}`,
      name: coalesceString(message.from.name, "Event registration"),
    },
    to: message.to.map((recipient) => ({ email: recipient.email })),
    ...(message.attachments === undefined ? {} : { attachments: message.attachments }),
  };

  const payload =
    message.type === "template"
      ? {
          ...common,
          template_uuid: message.templateId,
          template_variables: message.variables,
        }
      : {
          ...common,
          subject: message.subject,
          html: message.html,
          ...(message.text === undefined ? {} : { text: message.text }),
        };

  try {
    const response = await fetch(coalesceString(env.MAILTRAP_API_URL), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${coalesceString(env.MAILTRAP_API_TOKEN)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.ok) {
      return;
    }

    throw new MailtrapError(
      `Mailtrap rejected the email (${response.status})`,
      response.status,
      response.status === 429 || response.status >= 500,
    );
  } catch (error) {
    if (error instanceof EmailError) {
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

/** Mailtrap's template + direct sending API. */
export const mailtrapProvider: EmailProvider = {
  name: "mailtrap",
  capabilities: { templates: true, direct: true, attachments: true },
  isConfigured,
  send,
};
