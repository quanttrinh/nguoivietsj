// @boundary server
export type EmailProviderName = "gmail" | "mailtrap";

export interface EmailEnv {
  EMAIL_PROVIDER?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_SENDER_EMAIL?: string;
  GMAIL_SENDER_NAME?: string;
  GMAIL_TOKEN_URL?: string;
  GMAIL_SEND_URL?: string;
  MAILTRAP_API_URL?: string;
  MAILTRAP_API_TOKEN?: string;
  MAILTRAP_FROM_EMAIL?: string;
  MAILTRAP_FROM_NAME?: string;
}

export interface EmailAttachment {
  content: string;
  filename: string;
  type?: string;
  disposition?: "attachment" | "inline";
  content_id?: string;
}

/** A fully rendered email. Shared providers only transport it. */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

/** Contract implemented by every email transport. */
export interface EmailTransport {
  readonly name: EmailProviderName;
  isConfigured: (env: EmailEnv) => boolean;
  send: (env: EmailEnv, message: EmailMessage) => Promise<void>;
}

/** Error raised by an email provider. `status` 0 means a local/config error. */
export class EmailError extends Error {
  readonly provider: EmailProviderName;
  readonly status: number;
  readonly retryable: boolean;

  // oxlint-disable-next-line eslint/max-params -- provider, message, status, and retryability are distinct error fields.
  constructor(provider: EmailProviderName, message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "EmailError";
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}
