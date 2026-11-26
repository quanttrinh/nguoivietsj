// @boundary server
import { SUPPORTED_CURRENCY_CODES } from "~/features/events/domain/defaults";
import type { LocalizedText } from "~/features/events/domain/types";
import { SUPPORTED_LOCALES } from "~/platform/i18n";

import type { EventLocation, EventPayments } from "./schemas/event";
import type { EventNotes } from "./schemas/notes";
import type { RegistrationInput as RegistrationInputSchema } from "./schemas/registration";
import type { TicketTypeInput } from "./schemas/tickets";

export { checkinCreateSchema } from "./schemas/checkin";
export { eventCreateSchema, eventUpdateSchema } from "./schemas/event";
export { formVersionCreateSchema } from "./schemas/form";
export { paymentSchema } from "./schemas/payment";
export { registrationSchema } from "./schemas/registration";
export { ticketTypeSchema, ticketTypeUpdateSchema } from "./schemas/tickets";

export type RegistrationInput = RegistrationInputSchema;

/** Cross-field checks that ArkType does not express cleanly. */
export function validateTicketTypes(ticketTypes: readonly TicketTypeInput[]): string[] {
  const fields: string[] = [];
  const keys = new Set<string>();

  for (const [index, type] of ticketTypes.entries()) {
    if (keys.has(type.key)) {
      fields.push(`ticketTypes/${index}/key`);
    }

    keys.add(type.key);

    if (type.maxPerRegistration !== null && type.maxPerRegistration < type.minPerRegistration) {
      fields.push(`ticketTypes/${index}/maxPerRegistration`);
    }

    if (type.defaultQuantity < type.minPerRegistration) {
      fields.push(`ticketTypes/${index}/defaultQuantity`);
    }

    if (type.maxPerRegistration !== null && type.defaultQuantity > type.maxPerRegistration) {
      fields.push(`ticketTypes/${index}/defaultQuantity`);
    }
  }

  return fields;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate event location and payment details that need cross-field checks. */
export function validateEventDetails(
  location: EventLocation | undefined,
  payments: EventPayments | undefined,
): string[] {
  const fields: string[] = [];

  if (location !== undefined) {
    if (location.mapUrl !== null && !isHttpUrl(location.mapUrl)) {
      fields.push("location.mapUrl");
    }

    if (location.mapEmbedUrl !== null && !isHttpUrl(location.mapEmbedUrl)) {
      fields.push("location.mapEmbedUrl");
    }
  }

  if (payments !== undefined) {
    if (
      payments.etransfer.enabled &&
      (payments.etransfer.email === null || payments.etransfer.email.length === 0)
    ) {
      fields.push("payments.etransfer.email");
    }

    if (
      payments.cash.enabled &&
      (payments.cash.address === null || payments.cash.address.length === 0)
    ) {
      fields.push("payments.cash.address");
    }

    if (payments.cash.mapUrl !== null && !isHttpUrl(payments.cash.mapUrl)) {
      fields.push("payments.cash.mapUrl");
    }

    if (payments.cash.mapEmbedUrl !== null && !isHttpUrl(payments.cash.mapEmbedUrl)) {
      fields.push("payments.cash.mapEmbedUrl");
    }
  }

  return fields;
}

/** Validate event default locale and alias namespace rules. */
export function validateEventLocale(input: {
  defaultLocale: string | undefined;
  title: LocalizedText | undefined;
  aliases: readonly string[] | undefined;
  slug: string;
}): string[] {
  const { defaultLocale, title, aliases, slug } = input;
  const fields: string[] = [];

  if (defaultLocale !== undefined) {
    if (!SUPPORTED_LOCALES.has(defaultLocale)) {
      fields.push("defaultLocale");
    }

    if (title !== undefined && (title[defaultLocale] ?? "").trim().length === 0) {
      fields.push("title");
    }
  }

  if (aliases !== undefined) {
    const seen = new Set<string>();

    for (const [index, alias] of aliases.entries()) {
      if (alias === slug || seen.has(alias)) {
        fields.push(`aliases/${index}`);
      }

      seen.add(alias);
    }
  }

  return fields;
}

export function validateEventNotes(notes: EventNotes | undefined): string[] {
  const fields: string[] = [];

  if (notes === undefined) {
    return fields;
  }

  for (const [locale, blocks] of Object.entries(notes)) {
    for (const [index, block] of blocks.entries()) {
      if (block.type === "link" && !isHttpUrl(block.href)) {
        fields.push(`notes.${locale}.${index}.href`);
      }
    }
  }

  return fields;
}

function isSupportedTimezone(value: string) {
  try {
    // Constructing the formatter is the most reliable check: unlike
    // `supportedValuesOf("timeZone")`, it also accepts valid IANA aliases.
    void new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate event locale formatting values that need runtime support checks.
 *
 * Returns dotted field paths (`timezone`, `limits.currency`) for invalid
 * values. `undefined` means the field is not being changed and is skipped.
 */
export function validateEventFormatting(input: {
  timezone: string | undefined;
  currency: string | undefined;
}): string[] {
  const fields: string[] = [];

  if (input.timezone !== undefined && !isSupportedTimezone(input.timezone)) {
    fields.push("timezone");
  }

  if (input.currency !== undefined && !SUPPORTED_CURRENCY_CODES.has(input.currency)) {
    fields.push("limits.currency");
  }

  return fields;
}

export function validateEventDates(startsAt: string | null, endsAt: string | null): boolean {
  if (startsAt !== null && Number.isNaN(Date.parse(startsAt))) {
    return false;
  }

  if (endsAt !== null && Number.isNaN(Date.parse(endsAt))) {
    return false;
  }

  return !(startsAt !== null && endsAt !== null && Date.parse(endsAt) < Date.parse(startsAt));
}

export function invalidFields(paths: readonly string[]): string[] {
  const fields = new Set<string>();

  for (const path of paths) {
    const field = (path.startsWith("/") ? path.slice(1) : path).split("/")[0];

    if (field !== undefined && field.length > 0) {
      fields.add(field);
    }
  }

  return [...fields];
}
