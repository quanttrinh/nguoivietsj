/** Shared form-schema enums and reference helpers. */

import { CONTACT_KIND } from "~/events/domain/constants";

export const FORM_FIELD_WIDTH = {
  full: "full",
  half: "half",
} as const;

export const FORM_CONFIRMATION_MODE = {
  none: "none",
  optional: "optional",
  required: "required",
} as const;

export const FORM_GROUP_MODE = {
  flat: "flat",
  oneOf: "oneOf",
  atLeastOne: "atLeastOne",
  allOf: "allOf",
} as const;

export const FORM_GROUP_RENDERER = {
  fieldset: "fieldset",
  radio: "radio",
  tabs: "tabs",
  flat: "flat",
} as const;

export const FORM_CUSTOM_FIELD_TYPE = {
  text: "text",
  textarea: "textarea",
  number: "number",
  select: "select",
  radio: "radio",
  checkbox: "checkbox",
} as const;

export const FORM_CONDITION_OPERATOR = {
  equals: "equals",
  notEquals: "notEquals",
  in: "in",
  notIn: "notIn",
  exists: "exists",
  notExists: "notExists",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
} as const;

export const FORM_CONDITION_NODE = {
  all: "all",
  any: "any",
  not: "not",
} as const;

export const FORM_CONDITION_TARGET = {
  custom: "custom",
  contact: "contact",
  group: "group",
  ticket: "ticket",
  consent: "consent",
} as const;

export const FORM_VALIDATION_MODE = {
  draft: "draft",
  publish: "publish",
} as const;

export const FORM_ISSUE_SEVERITY = {
  error: "error",
  warning: "warning",
} as const;

export const FORM_FIELD_KIND = {
  fullName: "fullName",
  consent: "consent",
  contact: "contact",
  mail: "mail",
  confirmation: "confirmation",
  ticket: "ticket",
  custom: "custom",
  group: "group",
} as const;

export const FORM_REF_PREFIX = {
  system: "system",
  contacts: "system.contacts",
  tickets: "system.tickets",
  group: "group",
  custom: "custom",
  contact: "contact",
  ticket: "ticket",
  consent: "consent",
} as const;

export const FORM_REF = {
  fullName: "system.fullName",
  consent: "system.consent",
  confirmation: "system.confirmation",
  contactEmail: "system.contacts.email",
  contactPhone: "system.contacts.phone",
  contactMail: "system.contacts.mail",
} as const;

export const FORM_CONFIRMATION_FIELD_NAME = "confirmation";

export const FORM_MAIL_SUBFIELD = {
  addressLine1: "addressLine1",
  addressLine2: "addressLine2",
  city: "city",
  province: "province",
  postalCode: "postalCode",
  country: "country",
} as const;

export const FORM_CONTACT_REF = {
  [CONTACT_KIND.email]: FORM_REF.contactEmail,
  [CONTACT_KIND.phone]: FORM_REF.contactPhone,
  [CONTACT_KIND.mail]: FORM_REF.contactMail,
} as const;

export const FORM_CONTACT_REF_VALUES = Object.values(FORM_CONTACT_REF);

export const FORM_STATIC_REF_VALUES = [
  FORM_REF.fullName,
  FORM_REF.consent,
  FORM_REF.confirmation,
  ...FORM_CONTACT_REF_VALUES,
] as const;

export const FORM_CONTACT_REF_SET: ReadonlySet<string> = new Set(FORM_CONTACT_REF_VALUES);
export const FORM_STATIC_REF_SET: ReadonlySet<string> = new Set(FORM_STATIC_REF_VALUES);

export const FORM_OVERRIDE_KEY = {
  fullName: "fullName",
  consent: "consent",
} as const;

export const RESERVED_CUSTOM_FIELD_KEY = {
  fullName: "fullName",
  consent: "consent",
  contacts: "contacts",
  tickets: "tickets",
  formVersion: "formVersion",
  answers: "answers",
  metadata: "metadata",
  proto: "__proto__",
  constructor: "constructor",
  prototype: "prototype",
} as const;

export const FORM_TICKETS_FIELD_NAME = "tickets";

export const REGISTRATION_SOURCE = "events-web";

export const REGISTRATION_TURNSTILE_ACTION = "event-registration";

export const FORM_DEFAULT_MAIL_COUNTRY = "CA";

export const REGISTRATION_VALIDATION_CODE = {
  required: "required",
  invalidEmail: "invalid_email",
  invalidPhone: "invalid_phone",
  invalidPostalCode: "invalid_postal_code",
  invalidNumber: "invalid_number",
  invalidOption: "invalid_option",
  atLeastOneContact: "at_least_one_contact",
  confirmationRequired: "confirmation_required",
  confirmationContact: "confirmation_contact",
  confirmationMultiple: "confirmation_multiple",
  confirmationNotAllowed: "confirmation_not_allowed",
  duplicateContact: "duplicate_contact",
  groupOneOf: "group_one_of",
  groupAtLeastOne: "group_at_least_one",
  groupAllOf: "group_all_of",
  ticketUnavailable: "ticket_unavailable",
  unknownAnswer: "unknown_answer",
  invalidValue: "invalid_value",
} as const;

export const REGISTRATION_ERROR = {
  duplicate: "duplicate_registration",
  ticketLimit: "ticket_limit_reached",
  ticketTypeCapacity: "ticket_type_capacity_reached",
  eventCapacity: "event_capacity_reached",
  registrationClosed: "registration_closed",
  eventUnavailable: "event_unavailable",
  invalidPayload: "invalid_payload",
  rateLimited: "rate_limited",
  turnstileRequired: "turnstile_required",
  turnstileFailed: "turnstile_failed",
  turnstileUnavailable: "turnstile_unavailable",
} as const;

export function customRef(key: string): string {
  return `${FORM_REF_PREFIX.custom}.${key}`;
}

export function groupRef(key: string): string {
  return `${FORM_REF_PREFIX.group}.${key}`;
}

export function ticketRef(key: string): string {
  return `${FORM_REF_PREFIX.tickets}.${key}`;
}

export function contactRef(kind: string): string {
  return `${FORM_REF_PREFIX.contacts}.${kind}`;
}

export function contactFieldName(kind: string): string {
  return `${FORM_REF_PREFIX.contact}.${kind}`;
}

export function mailFieldName(subfield: string): string {
  return `${contactFieldName(CONTACT_KIND.mail)}.${subfield}`;
}

export function ticketFieldName(key: string): string {
  return `${FORM_REF_PREFIX.ticket}.${key}`;
}

export function refKey(ref: string, prefix: string): string | null {
  const expected = `${prefix}.`;
  return ref.startsWith(expected) ? ref.slice(expected.length) : null;
}

export function hasRefPrefix(ref: string, prefix: string): boolean {
  return refKey(ref, prefix) !== null;
}

export function isContactRef(ref: string): boolean {
  return FORM_CONTACT_REF_SET.has(ref);
}

export function isStaticFormRef(ref: string): boolean {
  return FORM_STATIC_REF_SET.has(ref);
}

export function isCustomRef(ref: string): boolean {
  return hasRefPrefix(ref, FORM_REF_PREFIX.custom);
}

export function isGroupRef(ref: string): boolean {
  return hasRefPrefix(ref, FORM_REF_PREFIX.group);
}

export function isSystemTicketRef(ref: string): boolean {
  return hasRefPrefix(ref, FORM_REF_PREFIX.tickets);
}

export function isContactConditionRef(ref: string): boolean {
  const kind = refKey(ref, FORM_REF_PREFIX.contact);
  return kind !== null && Object.hasOwn(CONTACT_KIND, kind);
}

export function contactKindFromConditionRef(ref: string): string | null {
  return isContactConditionRef(ref) ? refKey(ref, FORM_REF_PREFIX.contact) : null;
}

export function isGroupConditionRef(ref: string): boolean {
  return hasRefPrefix(ref, FORM_REF_PREFIX.group);
}

export function isTicketConditionRef(ref: string): boolean {
  return hasRefPrefix(ref, FORM_REF_PREFIX.ticket);
}

export function requiresFullWidthRef(ref: string): boolean {
  return isGroupRef(ref) || ref === FORM_REF.confirmation || ref === FORM_REF.contactMail;
}
