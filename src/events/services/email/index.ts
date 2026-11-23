// @boundary server
import { CONTACT_KIND, PAYMENT_METHOD } from "~/events/domain/constants";
import { localized } from "~/events/domain/localized";
import type { EventWithLimits, PaymentRecord, RegistrationRecord } from "~/events/domain/types";
import { createCheckinQrGif } from "~/events/services/checkin-qr";
import {
  createEmailSender,
  toBase64,
  type EmailAttachment,
  type EmailEnv,
  type EmailSender,
} from "~/server/services/email";
import { formatMoney } from "~/shared/utils/format";

/** Mailtrap settings plus the event domain's own template UUIDs. */
type EventEmailEnv = Pick<EmailEnv, "EMAIL_PROVIDER"> & {
  MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED?: string;
  MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED?: string;
  MAILTRAP_TEMPLATE_STATUS_OTP?: string;
};

/** The sender identity for event emails; the domain comes from the Worker origin. */
const EVENT_EMAIL_FROM = { local: "events", name: "Người Việt SJ Events" } as const;

type EventTemplate = "registrationReceived" | "paymentConfirmed" | "statusOtp";

/** The single place where event template variables and identity are bound. */
function eventSender(env: EventEmailEnv): EmailSender<EventTemplate> {
  return createEmailSender(
    env,
    {
      registrationReceived: env.MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED ?? "",
      paymentConfirmed: env.MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED ?? "",
      statusOtp: env.MAILTRAP_TEMPLATE_STATUS_OTP ?? "",
    },
    EVENT_EMAIL_FROM,
  );
}

/** True when Mailtrap and every event email template are configured. */
export function isEventEmailConfigured(env: EventEmailEnv): boolean {
  return eventSender(env).isConfigured();
}

interface EmailBaseInput {
  env: EventEmailEnv;
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
  env: EventEmailEnv;
  to: string;
  code: string;
  registrationId: string;
  expiresMinutes: number;
}

const CHECKIN_QR_CONTENT_ID = "checkin-qr";

function confirmationEmail(registration: RegistrationRecord) {
  const confirmation = registration.contacts.find(
    (contact) => contact.isConfirmation && contact.kind === CONTACT_KIND.email,
  );

  if (confirmation?.kind === CONTACT_KIND.email) {
    return confirmation.emailAddress;
  }

  const email = registration.contacts.find((contact) => contact.kind === CONTACT_KIND.email);

  return email?.kind === CONTACT_KIND.email ? email.emailAddress : null;
}

function ticketSummary(registration: RegistrationRecord, locale: string) {
  return registration.tickets
    .map((ticket) => {
      const label = localized(ticket.label, locale, ticket.key);
      return `${ticket.quantity} × ${label}`;
    })
    .join("\n");
}

function paymentInstructions(event: EventWithLimits) {
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

  await eventSender(input.env).sendTemplate("registrationReceived", to, {
    full_name: input.registration.fullName,
    registration_id: input.registration.id,
    event_title: title,
    ticket_summary: ticketSummary(input.registration, input.event.defaultLocale),
    amount_due: formatMoney(
      input.amountMinor,
      input.event.defaultLocale,
      input.event.limits.currency,
    ),
    payment_instructions: paymentInstructions(input.event),
    status_url: input.statusUrl,
    locale: input.event.defaultLocale,
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
  let method = "Other";

  if (input.payment.method === PAYMENT_METHOD.cash) {
    method = "Cash";
  } else if (input.payment.method === PAYMENT_METHOD.etransfer) {
    method = "e-Transfer";
  }

  const qrAttachment: EmailAttachment = {
    content: toBase64(createCheckinQrGif(input.registration.id)),
    filename: "checkin-qr.gif",
    type: "image/gif",
    disposition: "inline",
    content_id: CHECKIN_QR_CONTENT_ID,
  };

  await eventSender(input.env).sendTemplate(
    "paymentConfirmed",
    to,
    {
      full_name: input.registration.fullName,
      registration_id: input.registration.id,
      event_title: title,
      amount: formatMoney(
        input.payment.amountMinor,
        input.event.defaultLocale,
        input.payment.currency,
      ),
      method,
      status_url: input.statusUrl,
      qr_content_id: CHECKIN_QR_CONTENT_ID,
      locale: input.event.defaultLocale,
    },
    [qrAttachment],
  );

  return true;
}

/** Deliver a one-time code for registration status recovery. */
export async function sendStatusOtpEmail(input: StatusOtpEmailInput): Promise<boolean> {
  await eventSender(input.env).sendTemplate("statusOtp", input.to, {
    code: input.code,
    expires_minutes: input.expiresMinutes,
    registration_id: input.registrationId,
  });

  return true;
}
