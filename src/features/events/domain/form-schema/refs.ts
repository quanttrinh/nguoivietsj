// @boundary shared
/** Formatting and parsing helpers for form-schema field references. */

import { CONTACT_KIND, type ContactKind } from "~/features/events/domain/constants";
import { FORM_REF, FORM_REF_PREFIX } from "~/features/events/domain/form-schema/constants";

/** Reference of each contact field as stored in a form definition. */
export const CONTACT_FIELD_REFS = {
  email: FORM_REF.contactEmail,
  phone: FORM_REF.contactPhone,
  mail: FORM_REF.contactMail,
} as const satisfies Record<keyof typeof CONTACT_KIND, string>;

const FORM_STATIC_REF_SET: ReadonlySet<string> = new Set([
  FORM_REF.fullName,
  FORM_REF.consent,
  FORM_REF.confirmation,
]);
const CONTACT_FIELD_REF_SET: ReadonlySet<string> = new Set(Object.values(CONTACT_FIELD_REFS));
const CONTACT_KIND_SET: ReadonlySet<string> = new Set(Object.values(CONTACT_KIND));

function isContactKind(value: string): value is ContactKind {
  return CONTACT_KIND_SET.has(value);
}

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

function refKey(ref: string, prefix: string): string | null {
  const expected = `${prefix}.`;
  return ref.startsWith(expected) ? ref.slice(expected.length) : null;
}

export type ParsedRef =
  | { kind: "custom"; key: string }
  | { kind: "group"; key: string }
  | { kind: "consentCondition" }
  | { kind: "ticketCondition"; key: string }
  | { kind: "ticketField"; key: string }
  | { kind: "contactCondition"; contact: ContactKind }
  | { kind: "contactField"; ref: string }
  | { kind: "static"; ref: string }
  | { kind: "unknown"; ref: string };

export function parseRef(ref: string): ParsedRef {
  if (CONTACT_FIELD_REF_SET.has(ref)) {
    return { kind: "contactField", ref };
  }

  if (ref === FORM_REF_PREFIX.consent) {
    return { kind: "consentCondition" };
  }

  if (FORM_STATIC_REF_SET.has(ref)) {
    return { kind: "static", ref };
  }

  const contact = refKey(ref, FORM_REF_PREFIX.contact);

  if (contact !== null && isContactKind(contact)) {
    return { kind: "contactCondition", contact };
  }

  const custom = refKey(ref, FORM_REF_PREFIX.custom);

  if (custom !== null) {
    return { kind: "custom", key: custom };
  }

  const group = refKey(ref, FORM_REF_PREFIX.group);

  if (group !== null) {
    return { kind: "group", key: group };
  }

  const ticket = refKey(ref, FORM_REF_PREFIX.ticket);

  if (ticket !== null) {
    return { kind: "ticketCondition", key: ticket };
  }

  const ticketField = refKey(ref, FORM_REF_PREFIX.tickets);

  if (ticketField !== null) {
    return { kind: "ticketField", key: ticketField };
  }

  return { kind: "unknown", ref };
}
