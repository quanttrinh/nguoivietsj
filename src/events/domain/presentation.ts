import { CONTACT_KIND } from "~/events/domain/constants";
import { localized } from "~/events/domain/localized";
import type { RegistrationContactRecord, RegistrationRecord } from "~/events/domain/types";

/** Convert a schema default value to the text used by form controls. */
export function defaultValueText(value: unknown): string {
  if (value === null || value === undefined) {
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

export function registrationContact(
  registration: Pick<RegistrationRecord, "contacts">,
  kind: (typeof CONTACT_KIND)[keyof typeof CONTACT_KIND],
): RegistrationContactRecord | null {
  return registration.contacts.find((contact) => contact.kind === kind) ?? null;
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

export function registrationTicketSummary(
  registration: Pick<RegistrationRecord, "tickets">,
  locale: string,
  defaultLocale?: string,
): string {
  return registration.tickets
    .map(
      (ticket) =>
        `${ticket.quantity} × ${localized(ticket.label, locale, ticket.key, defaultLocale)}`,
    )
    .join(", ");
}

export function indexByRegistrationId<T extends { registrationId: string }>(
  records: readonly T[],
): Map<string, T> {
  return new Map(records.map((record) => [record.registrationId, record]));
}
