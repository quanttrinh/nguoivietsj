// @boundary shared
/** Formatting and parsing helpers for form-schema field references. */

import { CONTACT_KIND } from "~/features/events/domain/constants";
import {
  FORM_CONTACT_REF_VALUES,
  FORM_REF,
  FORM_REF_PREFIX,
} from "~/features/events/domain/form-schema/constants";

const FORM_STATIC_REF_VALUES = [
  FORM_REF.fullName,
  FORM_REF.consent,
  FORM_REF.confirmation,
  ...FORM_CONTACT_REF_VALUES,
] as const;

const FORM_CONTACT_REF_SET: ReadonlySet<string> = new Set(FORM_CONTACT_REF_VALUES);
const FORM_STATIC_REF_SET: ReadonlySet<string> = new Set(FORM_STATIC_REF_VALUES);

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

function hasRefPrefix(ref: string, prefix: string) {
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
  // A statically readable check keeps CONTACT_KIND usable in AOT definitions.
  return kind !== null && Object.values(CONTACT_KIND).some((value) => value === kind);
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
