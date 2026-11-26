// @boundary server
import { mailtrapProvider } from "./mailtrap";
import { emailRegistry, registerEmailProvider } from "./providers";
import {
  EmailError,
  type EmailAddress,
  type EmailAttachment,
  type EmailEnv,
  type EmailFrom,
  type EmailProvider,
  type EmailSender,
} from "./types";

registerEmailProvider(mailtrapProvider);

export { toBase64 } from "./encoding";
export { mailtrapProvider } from "./mailtrap";
export {
  createEmailRegistry,
  emailRegistry,
  type EmailRegistry,
  registerEmailProvider,
  registeredEmailProviders,
  resolveEmailProvider,
} from "./providers";
export { EmailError } from "./types";
export type {
  DirectEmail,
  EmailAddress,
  EmailAttachment,
  EmailCapabilities,
  EmailEnv,
  EmailFrom,
  EmailMessage,
  EmailProvider,
  EmailSender,
  TemplateEmail,
} from "./types";

/**
 * Cloudflare environment bags are interfaces that also carry non-string
 * bindings, so the generic layer accepts any object and reads only the string
 * configuration keys it needs.
 */
function emailEnv(env: object): EmailEnv {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Cloudflare Env interfaces lack an index signature but expose string config keys.
  return env as EmailEnv;
}

function toEmailAddress(from: EmailFrom): EmailAddress {
  return { email: from.local, name: from.name };
}

function assertConfigured(provider: EmailProvider, env: EmailEnv) {
  if (!provider.isConfigured(env)) {
    throw new EmailError("email_not_configured", 0, false);
  }
}

function assertAttachments(provider: EmailProvider, attachments: EmailAttachment[] | undefined) {
  if (!provider.capabilities.attachments && attachments !== undefined) {
    throw new EmailError("email_attachments_unsupported", 0, false);
  }
}

export function isEmailConfigured(env: object): boolean {
  const resolved = emailEnv(env);
  return emailRegistry.resolve(resolved).isConfigured(resolved);
}

/**
 * Bind a set of domain-specific template UUIDs and a sender identity to a
 * reusable sender that resolves templates by logical name. The generic service
 * never sees a raw `MAILTRAP_TEMPLATE_*` variable or a fully-qualified address.
 */
export function createEmailSender<TName extends string>(
  env: object,
  templates: Readonly<Record<TName, string>>,
  from: EmailFrom,
): EmailSender<TName> {
  const resolved = emailEnv(env);
  const provider = emailRegistry.resolve(resolved);
  if (!provider.capabilities.templates) {
    throw new EmailError("email_templates_unsupported", 0, false);
  }

  const sender = toEmailAddress(from);

  return {
    isConfigured(): boolean {
      const templateUuids: string[] = Object.values<string>(templates);
      return provider.isConfigured(resolved) && templateUuids.every((uuid) => uuid.length > 0);
    },
    // oxlint-disable-next-line eslint/max-params -- fixed four-argument sender API.
    async sendTemplate(
      name: TName,
      to: string,
      variables: Record<string, string | number>,
      attachments?: EmailAttachment[],
    ): Promise<void> {
      assertConfigured(provider, resolved);
      const templateId = templates[name];
      if (!templateId) {
        throw new EmailError("email_template_not_configured", 0, false);
      }
      assertAttachments(provider, attachments);

      await provider.send(resolved, {
        type: "template",
        from: sender,
        to: [{ email: to }],
        templateId,
        variables,
        ...(attachments === undefined ? {} : { attachments }),
      });
    },
    async sendDirect(
      to: string,
      content: {
        subject: string;
        html: string;
        text?: string;
        attachments?: EmailAttachment[];
      },
    ): Promise<void> {
      assertConfigured(provider, resolved);
      if (!provider.capabilities.direct) {
        throw new EmailError("email_direct_unsupported", 0, false);
      }
      assertAttachments(provider, content.attachments);

      await provider.send(resolved, {
        type: "direct",
        from: sender,
        to: [{ email: to }],
        subject: content.subject,
        html: content.html,
        ...(content.text === undefined ? {} : { text: content.text }),
        ...(content.attachments === undefined ? {} : { attachments: content.attachments }),
      });
    },
  };
}
