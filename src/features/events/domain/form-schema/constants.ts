// @boundary shared
/** Shared form-schema enums, references, and registration validation codes. */

import { CONTACT_KIND } from "~/features/events/domain/constants";

/** Current persisted form-schema version. */
export const FORM_SCHEMA_VERSION = 4;

// Form enums

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

// Reference keys, field names, and reserved keys

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

const FORM_CONTACT_REF = {
  [CONTACT_KIND.email]: FORM_REF.contactEmail,
  [CONTACT_KIND.phone]: FORM_REF.contactPhone,
  [CONTACT_KIND.mail]: FORM_REF.contactMail,
} as const;

export const FORM_CONTACT_REF_VALUES = Object.values(FORM_CONTACT_REF);

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

// Registration validation codes

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
