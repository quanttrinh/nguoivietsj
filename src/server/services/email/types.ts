// @boundary server
/** A single mailbox. For generic senders the `email` field may be a local part. */
export interface EmailAddress {
  email: string;
  name?: string;
}

/** Environment bag: a generic provider selector plus arbitrary provider keys. */
export interface EmailEnv {
  EMAIL_PROVIDER?: string;
  [key: string]: string | undefined;
}

/** Sender identity supplied by a domain; the transport appends the Worker domain. */
export interface EmailFrom {
  local: string;
  name: string;
}

export interface EmailAttachment {
  content: string;
  filename: string;
  type?: string;
  disposition?: "attachment" | "inline";
  content_id?: string;
}

/** A template-backed email, ready for the transport. */
export interface TemplateEmail {
  type: "template";
  from: EmailAddress;
  to: EmailAddress[];
  templateId: string;
  variables: Record<string, string | number>;
  attachments?: EmailAttachment[];
}

/** An email whose body is supplied directly, ready for the transport. */
export interface DirectEmail {
  type: "direct";
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export type EmailMessage = TemplateEmail | DirectEmail;

/** What a provider can actually deliver. */
export interface EmailCapabilities {
  templates: boolean;
  direct: boolean;
  attachments: boolean;
}

/** A pluggable email transport. Register one in the provider registry. */
export interface EmailProvider {
  readonly name: string;
  readonly capabilities: EmailCapabilities;
  isConfigured: (env: EmailEnv) => boolean;
  send: (env: EmailEnv, message: EmailMessage) => Promise<void>;
}

/** A domain-bound sender that resolves templates by logical name. */
export interface EmailSender<TName extends string> {
  isConfigured: () => boolean;
  // oxlint-disable-next-line eslint/max-params -- fixed four-argument sender API.
  sendTemplate: (
    name: TName,
    to: string,
    variables: Record<string, string | number>,
    attachments?: EmailAttachment[],
  ) => Promise<void>;
  sendDirect: (
    to: string,
    content: {
      subject: string;
      html: string;
      text?: string;
      attachments?: EmailAttachment[];
    },
  ) => Promise<void>;
}

/** Error raised by the email transport. `status` 0 means a local/config error. */
export class EmailError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "EmailError";
    this.status = status;
    this.retryable = retryable;
  }
}
