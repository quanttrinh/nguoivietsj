import { Type, type Static } from "@sinclair/typebox";

import { EVENT_STATUS, FORM_VERSION_STATUS } from "~/events/domain/constants";
import {
  MAX_CONTACTS_PER_REGISTRATION,
  MAX_EVENT_ALIASES,
  MAX_EVENT_ALIAS_LENGTH,
  MAX_EVENT_CASH_ADDRESS_LENGTH,
  MAX_EVENT_LOCATION_ADDRESS_LENGTH,
  MAX_EVENT_LOCATION_NAME_LENGTH,
  MAX_NOTE_BLOCKS,
  MAX_NOTE_BULLET_LENGTH,
  MAX_NOTE_PARAGRAPH_LENGTH,
  MAX_TICKET_TYPES_PER_EVENT,
  MAX_TICKETS_PER_REGISTRATION,
} from "~/events/domain/limits";
import { SCHEMA_FORMAT } from "~/events/domain/schema-formats";
import { localizedTextSchema } from "~/events/domain/schema-primitives";
import type {
  EventLocation,
  EventNotes,
  EventPayments,
  LocalizedText,
  TicketTypeInput,
} from "~/events/domain/types";
import {
  MAX_ADDRESS_LINE_LENGTH,
  MAX_CITY_LENGTH,
  MAX_EMAIL_ADDRESS_LENGTH,
  MAX_FULL_NAME_LENGTH,
  MAX_PHONE_NUMBER_LENGTH,
  MAX_POSTAL_CODE_LENGTH,
  MAX_TURNSTILE_TOKEN_LENGTH,
  MAX_UUID_V7_LENGTH,
} from "~/shared/constants/limits";
import { SUPPORTED_LOCALES } from "~/shared/constants/locales";
import { EVENT_SLUG_REGEX, LEADING_SLASH_REGEX } from "~/shared/constants/patterns";

const nullableLocalizedText = Type.Union([localizedTextSchema, Type.Null()]);
const optionalNullableLocalizedText = Type.Optional(nullableLocalizedText);

const shortStringSchema = Type.String({ maxLength: MAX_EVENT_CASH_ADDRESS_LENGTH });
const nullableShortString = Type.Union([shortStringSchema, Type.Null()]);
const optionalNullableShortString = Type.Optional(nullableShortString);

const unknownRecordSchema = Type.Record(Type.String({ maxLength: 64 }), Type.Unknown());
const optionalUnknownRecord = Type.Optional(unknownRecordSchema);

const nullableAddressLine = Type.Union([
  Type.String({ maxLength: MAX_ADDRESS_LINE_LENGTH }),
  Type.Null(),
]);
const optionalNullableAddressLine = Type.Optional(nullableAddressLine);

const nullableFormVersion = Type.Union([
  Type.Integer({ minimum: 1, maximum: 1_000_000 }),
  Type.Null(),
]);
const optionalNullableFormVersion = Type.Optional(nullableFormVersion);

const nullableNonNegativeInteger = Type.Union([
  Type.Integer({ minimum: 0, maximum: 1_000_000 }),
  Type.Null(),
]);

export const eventStatusSchema = Type.Union(
  Object.values(EVENT_STATUS).map((status) => Type.Literal(status)),
);

const optionalNullableUrl = Type.Optional(
  Type.Union([Type.String({ maxLength: 1000 }), Type.Null()]),
);
const optionalNullableEmail = Type.Optional(
  Type.Union([
    Type.String({ maxLength: MAX_EMAIL_ADDRESS_LENGTH, format: SCHEMA_FORMAT.email }),
    Type.Null(),
  ]),
);

const locationSchema = Type.Object(
  {
    name: Type.String({ maxLength: MAX_EVENT_LOCATION_NAME_LENGTH }),
    address: Type.String({ maxLength: MAX_EVENT_LOCATION_ADDRESS_LENGTH }),
    mapUrl: optionalNullableUrl,
    mapEmbedUrl: optionalNullableUrl,
  },
  { additionalProperties: false },
);

const paymentsSchema = Type.Object(
  {
    etransfer: Type.Object(
      {
        enabled: Type.Boolean(),
        email: optionalNullableEmail,
      },
      { additionalProperties: false },
    ),
    cash: Type.Object(
      {
        enabled: Type.Boolean(),
        address: optionalNullableShortString,
        mapUrl: optionalNullableUrl,
        mapEmbedUrl: optionalNullableUrl,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const noteBulletSchema = Type.String({
  minLength: 1,
  maxLength: MAX_NOTE_BULLET_LENGTH,
});

const noteBlockSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal("paragraph"),
      text: Type.String({ minLength: 1, maxLength: MAX_NOTE_PARAGRAPH_LENGTH }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("bullets"),
      items: Type.Array(noteBulletSchema, {
        minItems: 1,
        maxItems: MAX_NOTE_BLOCKS,
      }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("link"),
      label: Type.String({ minLength: 1, maxLength: 80 }),
      href: Type.String({ minLength: 1, maxLength: 1000 }),
    },
    { additionalProperties: false },
  ),
]);

const eventNotesSchema = Type.Record(
  Type.String({ minLength: 2, maxLength: 10, format: SCHEMA_FORMAT.localeKey }),
  Type.Array(noteBlockSchema, { maxItems: MAX_NOTE_BLOCKS }),
);

const limitsSchema = Type.Object(
  {
    currency: Type.String({ format: SCHEMA_FORMAT.currency }),
    maxTicketsPerRegistration: nullableNonNegativeInteger,
    maxTotalTickets: nullableNonNegativeInteger,
  },
  { additionalProperties: false },
);

export const ticketTypeSchema = Type.Object(
  {
    key: Type.String({ format: SCHEMA_FORMAT.ticketKey }),
    label: localizedTextSchema,
    description: optionalNullableLocalizedText,
    priceMinor: Type.Integer({ minimum: 0, maximum: 100_000_000 }),
    minPerRegistration: Type.Integer({ minimum: 0, maximum: 1000 }),
    maxPerRegistration: Type.Union([Type.Integer({ minimum: 0, maximum: 1000 }), Type.Null()]),
    defaultQuantity: Type.Integer({ minimum: 0, maximum: 1000 }),
    capacity: Type.Union([Type.Integer({ minimum: 0, maximum: 1_000_000 }), Type.Null()]),
    active: Type.Boolean(),
    sortOrder: Type.Integer({ minimum: -1000, maximum: 1000 }),
  },
  { additionalProperties: false },
);

export const ticketTypeUpdateSchema = Type.Partial(Type.Omit(ticketTypeSchema, ["key"]), {
  additionalProperties: false,
  minProperties: 1,
});

const aliasSchema = Type.String({
  minLength: 1,
  maxLength: MAX_EVENT_ALIAS_LENGTH,
  format: SCHEMA_FORMAT.eventSlug,
});

const defaultLocaleSchema = Type.String({
  minLength: 2,
  maxLength: 10,
  format: SCHEMA_FORMAT.localeKey,
});

const eventOptionalFields = {
  defaultLocale: Type.Optional(defaultLocaleSchema),
  aliases: Type.Optional(Type.Array(aliasSchema, { maxItems: MAX_EVENT_ALIASES })),
  summary: Type.Optional(localizedTextSchema),
  startsAt: optionalNullableShortString,
  endsAt: optionalNullableShortString,
  timezone: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  status: Type.Optional(eventStatusSchema),
  enabled: Type.Optional(Type.Boolean()),
  registrationOpen: Type.Optional(Type.Boolean()),
  location: Type.Optional(locationSchema),
  payments: Type.Optional(paymentsSchema),
  notes: Type.Optional(eventNotesSchema),
};

export const eventCreateSchema = Type.Object(
  {
    slug: Type.String({
      minLength: 1,
      maxLength: 80,
      format: SCHEMA_FORMAT.eventSlug,
    }),
    eventType: Type.String({
      minLength: 1,
      maxLength: 40,
      format: SCHEMA_FORMAT.eventType,
    }),
    editionYear: Type.Integer({ minimum: 2000, maximum: 2100 }),
    title: localizedTextSchema,
    limits: limitsSchema,
    ...eventOptionalFields,
    ticketTypes: Type.Array(ticketTypeSchema, {
      minItems: 1,
      maxItems: MAX_TICKET_TYPES_PER_EVENT,
    }),
  },
  { additionalProperties: false },
);

export const eventUpdateSchema = Type.Object(
  {
    title: Type.Optional(localizedTextSchema),
    limits: Type.Optional(limitsSchema),
    ...eventOptionalFields,
  },
  { additionalProperties: false, minProperties: 1 },
);

const contactBase = {
  label: Type.Optional(Type.String({ maxLength: 80 })),
  isPrimary: Type.Optional(Type.Boolean()),
  isConfirmation: Type.Optional(Type.Boolean()),
  value: Type.Optional(Type.Record(Type.String({ maxLength: 64 }), Type.Unknown())),
};

const emailContactSchema = Type.Object(
  {
    kind: Type.Literal("email"),
    email: Type.String({
      minLength: 3,
      maxLength: MAX_EMAIL_ADDRESS_LENGTH,
      format: SCHEMA_FORMAT.email,
    }),
    ...contactBase,
  },
  { additionalProperties: false },
);

const phoneContactSchema = Type.Object(
  {
    kind: Type.Literal("phone"),
    phone: Type.String({
      minLength: 10,
      maxLength: MAX_PHONE_NUMBER_LENGTH,
      format: SCHEMA_FORMAT.phone,
    }),
    ...contactBase,
  },
  { additionalProperties: false },
);

const mailContactSchema = Type.Object(
  {
    kind: Type.Literal("mail"),
    addressLine1: Type.String({ minLength: 1, maxLength: MAX_ADDRESS_LINE_LENGTH }),
    addressLine2: optionalNullableAddressLine,
    city: Type.String({ minLength: 1, maxLength: MAX_CITY_LENGTH }),
    province: Type.String({ minLength: 2, maxLength: 2 }),
    postalCode: Type.String({ minLength: 3, maxLength: MAX_POSTAL_CODE_LENGTH }),
    country: Type.Optional(Type.String({ minLength: 2, maxLength: 2 })),
    ...contactBase,
  },
  { additionalProperties: false },
);

const contactSchema = Type.Union([emailContactSchema, phoneContactSchema, mailContactSchema]);

const ticketSelectionSchema = Type.Object(
  {
    key: Type.String({ format: SCHEMA_FORMAT.ticketKey }),
    quantity: Type.Integer({ minimum: 0, maximum: MAX_TICKETS_PER_REGISTRATION }),
  },
  { additionalProperties: false },
);

export const registrationSchema = Type.Object(
  {
    fullName: Type.String({ minLength: 1, maxLength: MAX_FULL_NAME_LENGTH }),
    contacts: Type.Array(contactSchema, { minItems: 1, maxItems: MAX_CONTACTS_PER_REGISTRATION }),
    tickets: Type.Array(ticketSelectionSchema, {
      minItems: 1,
      maxItems: MAX_TICKET_TYPES_PER_EVENT,
    }),
    consent: Type.Literal(true),
    formVersion: optionalNullableFormVersion,
    answers: optionalUnknownRecord,
    metadata: optionalUnknownRecord,
    turnstileToken: Type.Optional(Type.String({ maxLength: MAX_TURNSTILE_TOKEN_LENGTH })),
  },
  { additionalProperties: false },
);

export const checkinCreateSchema = Type.Object(
  {
    registrationId: Type.String({ format: SCHEMA_FORMAT.uuidV7, maxLength: MAX_UUID_V7_LENGTH }),
  },
  { additionalProperties: false },
);

export const formVersionCreateSchema = Type.Object(
  {
    version: Type.Integer({ minimum: 1, maximum: 1_000_000 }),
    schema: unknownRecordSchema,
    status: Type.Union([
      Type.Literal(FORM_VERSION_STATUS.draft),
      Type.Literal(FORM_VERSION_STATUS.published),
    ]),
  },
  { additionalProperties: false },
);

export type EventCreateBody = Static<typeof eventCreateSchema>;
export type EventUpdateBody = Static<typeof eventUpdateSchema>;
export type TicketTypeBody = Static<typeof ticketTypeSchema>;
export type TicketTypeUpdateBody = Static<typeof ticketTypeUpdateSchema>;
export type RegistrationBody = Static<typeof registrationSchema>;
export type FormVersionCreateBody = Static<typeof formVersionCreateSchema>;
export type CheckinCreateBody = Static<typeof checkinCreateSchema>;

/** Cross-field checks that TypeBox does not express cleanly. */
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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate event location and payment details that TypeBox cannot express. */
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
      if (!EVENT_SLUG_REGEX.test(alias) || alias === slug || seen.has(alias)) {
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
    const field = path.replace(LEADING_SLASH_REGEX, "").split("/")[0];

    if (field !== undefined && field.length > 0) {
      fields.add(field);
    }
  }

  return [...fields];
}
