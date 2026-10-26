// @boundary server
import { gmailTransport } from "./gmail";
import { mailtrapTransport } from "./mailtrap";
import {
  EmailError,
  type EmailEnv,
  type EmailMessage,
  type EmailProviderName,
  type EmailTransport,
} from "./types";

export { toBase64 } from "./encoding";
export { EmailError } from "./types";
export type { EmailAttachment, EmailEnv, EmailMessage } from "./types";

const TRANSPORTS: Record<EmailProviderName, EmailTransport> = {
  gmail: gmailTransport,
  mailtrap: mailtrapTransport,
};

/** Resolve the provider from `EMAIL_PROVIDER`; Gmail is the default. */
function resolveEmailProvider(env: EmailEnv): EmailProviderName {
  return env.EMAIL_PROVIDER === "mailtrap" ? "mailtrap" : "gmail";
}

/** Return the transport selected by `EMAIL_PROVIDER`. */
export function emailTransport(env: EmailEnv): EmailTransport {
  return TRANSPORTS[resolveEmailProvider(env)];
}

/** True when the active transport has its base configuration. */
export function isEmailConfigured(env: EmailEnv): boolean {
  return emailTransport(env).isConfigured(env);
}

/** Send a fully rendered email through the active transport. */
export async function sendEmail(env: EmailEnv, message: EmailMessage): Promise<void> {
  const transport = emailTransport(env);

  if (!transport.isConfigured(env)) {
    throw new EmailError(transport.name, "email_not_configured", 0, false);
  }

  await transport.send(env, message);
}
