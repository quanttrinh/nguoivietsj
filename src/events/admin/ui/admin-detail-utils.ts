import { dateTimeFormatter } from "~/shared/utils/format";

import type { Contact } from "./admin-detail-types";

export function formatDateTime(value: string, locale: string, timezone: string): string {
  return dateTimeFormatter(locale, timezone).format(new Date(value));
}
export function contactText(contact: Contact): string {
  if (contact.kind === "email") {
    return contact.emailAddress ?? "";
  }
  if (contact.kind === "phone") {
    return contact.phoneNumber ?? "";
  }
  return [contact.city, contact.province].filter(Boolean).join(", ");
}
