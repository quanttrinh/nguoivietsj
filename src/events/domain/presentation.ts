// @boundary shared
import { CONTACT_KIND } from "~/events/domain/constants";
import { isRegistrationPaid } from "~/events/domain/payment";
import { type RegistrationContactRecord, type RegistrationRecord } from "~/events/domain/types";

/** Convert a schema default value to the text used by form controls. */
export function defaultValueText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function registrationAmountDue(registration: Pick<RegistrationRecord, "tickets">): number {
  return registration.tickets.reduce(
    (total, ticket) => total + ticket.quantity * ticket.unitPriceMinor,
    0,
  );
}

export function contactDisplay(contact: RegistrationContactRecord): string {
  if (contact.kind === CONTACT_KIND.email) {
    return contact.emailAddress;
  }

  if (contact.kind === CONTACT_KIND.phone) {
    return contact.phoneNumber;
  }

  return `${contact.city}, ${contact.province}`;
}

export function indexByRegistrationId<TItem extends { registrationId: string }>(
  records: readonly TItem[],
): Map<string, TItem> {
  return new Map(records.map((record) => [record.registrationId, record]));
}

export interface PaymentStatusLabels {
  paid: string;
  unpaid: string;
  noPaymentRequired: string;
}

/** Localized payment label shared by staff support and payment views. */
export function registrationPaymentStatusText(
  payment: { amountMinor: number } | null,
  amountDue: number,
  labels: PaymentStatusLabels,
): string {
  if (amountDue === 0) {
    return labels.noPaymentRequired;
  }

  return isRegistrationPaid(payment, amountDue) ? labels.paid : labels.unpaid;
}
