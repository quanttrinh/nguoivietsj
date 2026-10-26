import { CONTACT_KIND, PAYMENT_METHOD } from "~/events/domain/constants";
import { localized } from "~/events/domain/localized";
import type { EventWithLimits, PaymentRecord, RegistrationRecord } from "~/events/domain/types";
import { createCheckinQrGif } from "~/events/server/checkin-qr";
import { toBase64, sendTemplateEmail, type MailtrapEnv } from "~/shared/server/email/mailtrap";
import { formatMoney } from "~/shared/utils/format";

interface EmailBaseInput {
  env: MailtrapEnv;
  event: EventWithLimits;
  registration: RegistrationRecord;
  statusUrl: string;
}

export interface RegistrationEmailInput extends EmailBaseInput {
  amountMinor: number;
}

export interface PaymentEmailInput extends EmailBaseInput {
  payment: PaymentRecord;
}

export interface StatusOtpEmailInput {
  env: MailtrapEnv;
  to: string;
  code: string;
  registrationId: string;
  expiresMinutes: number;
}

const CHECKIN_QR_CONTENT_ID = "checkin-qr";

function confirmationEmail(registration: RegistrationRecord): string | null {
  const confirmation = registration.contacts.find(
    (contact) => contact.isConfirmation && contact.kind === CONTACT_KIND.email,
  );

  if (confirmation?.kind === CONTACT_KIND.email) {
    return confirmation.emailAddress;
  }

  const email = registration.contacts.find((contact) => contact.kind === CONTACT_KIND.email);

  return email?.kind === CONTACT_KIND.email ? email.emailAddress : null;
}

function ticketSummary(registration: RegistrationRecord, locale: string): string {
  return registration.tickets
    .map((ticket) => {
      const label = localized(ticket.label, locale, ticket.key);
      return `${ticket.quantity} × ${label}`;
    })
    .join("\n");
}

function paymentInstructions(event: EventWithLimits): string {
  const items: string[] = [];

  if (event.payments.etransfer.enabled && event.payments.etransfer.email !== null) {
    items.push(`e-Transfer to ${event.payments.etransfer.email}`);
  }

  if (event.payments.cash.enabled && event.payments.cash.address !== null) {
    items.push(`Cash in person at ${event.payments.cash.address}`);
  }

  return items.length === 0 ? "No payment is required for this registration." : items.join("\n");
}

/** Deliver the registration-received email template. */
export async function sendRegistrationReceivedEmail(
  input: RegistrationEmailInput,
): Promise<boolean> {
  const to = confirmationEmail(input.registration);

  if (to === null) {
    return false;
  }

  const title = localized(
    input.event.title,
    input.event.defaultLocale,
    input.event.slug,
    input.event.defaultLocale,
  );

  await sendTemplateEmail(input.env, {
    to,
    templateUuid: input.env.MAILTRAP_REGISTRATION_TEMPLATE_UUID,
    variables: {
      full_name: input.registration.fullName,
      registration_id: input.registration.id,
      event_title: title,
      ticket_summary: ticketSummary(input.registration, input.event.defaultLocale),
      amount_due: formatMoney(
        input.amountMinor,
        input.event.limits.currency,
        input.event.defaultLocale,
      ),
      payment_instructions: paymentInstructions(input.event),
      status_url: input.statusUrl,
      locale: input.event.defaultLocale,
    },
  });

  return true;
}

/** Deliver the payment-confirmed email template with its embedded QR image. */
export async function sendPaymentConfirmedEmail(input: PaymentEmailInput): Promise<boolean> {
  const to = confirmationEmail(input.registration);

  if (to === null) {
    return false;
  }

  const title = localized(
    input.event.title,
    input.event.defaultLocale,
    input.event.slug,
    input.event.defaultLocale,
  );
  const method = input.payment.method === PAYMENT_METHOD.cash ? "Cash" : "e-Transfer";

  await sendTemplateEmail(input.env, {
    to,
    templateUuid: input.env.MAILTRAP_PAYMENT_TEMPLATE_UUID,
    variables: {
      full_name: input.registration.fullName,
      registration_id: input.registration.id,
      event_title: title,
      amount: formatMoney(
        input.payment.amountMinor,
        input.payment.currency,
        input.event.defaultLocale,
      ),
      method,
      status_url: input.statusUrl,
      qr_content_id: CHECKIN_QR_CONTENT_ID,
      locale: input.event.defaultLocale,
    },
    attachments: [
      {
        content: toBase64(createCheckinQrGif(input.registration.id)),
        filename: "checkin-qr.gif",
        type: "image/gif",
        disposition: "inline",
        content_id: CHECKIN_QR_CONTENT_ID,
      },
    ],
  });

  return true;
}

/** Deliver a one-time code for registration status recovery. */
export async function sendStatusOtpEmail(input: StatusOtpEmailInput): Promise<boolean> {
  await sendTemplateEmail(input.env, {
    to: input.to,
    templateUuid: input.env.MAILTRAP_STATUS_OTP_TEMPLATE_UUID,
    variables: {
      code: input.code,
      expires_minutes: input.expiresMinutes,
      registration_id: input.registrationId,
    },
  });

  return true;
}

/** Build a status-page URL for a registration token. */
export function statusPageUrl(baseUrl: string, locale: string, token: string): string {
  return new URL(
    `/${locale}/events/status/view?token=${encodeURIComponent(token)}`,
    baseUrl,
  ).toString();
}
