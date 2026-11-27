// @boundary shared
import { type } from "arktype";
/* oxlint-disable eslint/max-params, eslint/no-continue -- Form validation passes explicit schema maps and skips non-applicable fields. */

import { CONTACT_KIND } from "~/features/events/domain/constants";
import {
  FORM_CONFIRMATION_MODE,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_GROUP_MODE,
  FORM_GROUP_RENDERER,
  FORM_MAIL_SUBFIELD,
  FORM_REF,
  FORM_REF_PREFIX,
  REGISTRATION_VALIDATION_CODE,
} from "~/features/events/domain/form-schema/constants";
import {
  contactRef,
  customRef,
  groupRef,
  mailFieldName,
  refKey,
  ticketFieldName,
} from "~/features/events/domain/form-schema/refs";
import {
  computeConditionalState,
  type FormStateConditions,
  type FormStateVisibility,
} from "~/features/events/domain/form-schema/state";
import type {
  FormCustomField,
  FormGroup,
  FormSchema,
  RegistrationFormIssue,
  RegistrationFormValidationResult,
} from "~/features/events/domain/form-schema/types";
import type { ContactInput, RegistrationInput } from "~/features/events/domain/types";

const canadianPostalCodeSchema = type(/^[A-Z]\d[A-Z] \d[A-Z]\d$/u);

type FormValue = string | number | boolean | null | undefined;

interface ContactValues {
  byKind: Map<string, ContactInput>;
  duplicates: Set<string>;
}

function collectContacts(contacts: readonly ContactInput[]): ContactValues {
  const byKind = new Map<string, ContactInput>();
  const duplicates = new Set<string>();

  for (const contact of contacts) {
    if (byKind.has(contact.kind)) {
      duplicates.add(contact.kind);
    } else {
      byKind.set(contact.kind, contact);
    }
  }

  return { byKind, duplicates };
}

/** Indexes over a single form schema, built once per validation. */
interface FormSchemaMaps {
  customFields: ReadonlyMap<string, FormCustomField>;
  groups: ReadonlyMap<string, FormGroup>;
  /** Reverse index from a member ref to its owning group, first group wins. */
  groupByMember: ReadonlyMap<string, FormGroup>;
}

function buildFormSchemaMaps(schema: FormSchema): FormSchemaMaps {
  const customFields = new Map((schema.customFields ?? []).map((field) => [field.key, field]));
  const groups = new Map((schema.groups ?? []).map((group) => [group.key, group]));
  const groupByMember = new Map<string, FormGroup>();

  for (const group of groups.values()) {
    for (const member of group.members) {
      if (!groupByMember.has(member)) {
        groupByMember.set(member, group);
      }
    }
  }

  return { customFields, groups, groupByMember };
}

function customValue(input: RegistrationInput, key: string): unknown {
  return input.answers[key];
}

function hasCustomValue(field: FormCustomField, value: unknown) {
  if (value == null) {
    return false;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
    return value === true;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.number) {
    return typeof value === "number" && Number.isFinite(value);
  }

  return typeof value === "string" && value.trim().length > 0;
}

function memberHasValue(
  ref: string,
  input: RegistrationInput,
  contacts: ContactValues,
  maps: FormSchemaMaps,
) {
  if (ref === FORM_REF.contactEmail) {
    return contacts.byKind.has(CONTACT_KIND.email);
  }

  if (ref === FORM_REF.contactPhone) {
    return contacts.byKind.has(CONTACT_KIND.phone);
  }

  if (ref === FORM_REF.contactMail) {
    return contacts.byKind.has(CONTACT_KIND.mail);
  }

  if (ref.startsWith(`${FORM_REF_PREFIX.custom}.`)) {
    const key = refKey(ref, FORM_REF_PREFIX.custom) ?? "";
    const field = maps.customFields.get(key);

    return field !== undefined && hasCustomValue(field, customValue(input, key));
  }

  return false;
}

function selectedGroupRef(
  group: FormGroup,
  input: RegistrationInput,
  contacts: ContactValues,
  maps: FormSchemaMaps,
) {
  const present = group.members.filter((member) => memberHasValue(member, input, contacts, maps));

  if (group.mode === FORM_GROUP_MODE.oneOf) {
    return present.length === 1 ? (present[0] ?? null) : null;
  }

  return present[0] ?? null;
}

function groupMemberVisible(
  ref: string,
  input: RegistrationInput,
  contacts: ContactValues,
  maps: FormSchemaMaps,
) {
  const group = maps.groupByMember.get(ref) ?? null;

  if (
    group === null ||
    group.mode !== FORM_GROUP_MODE.oneOf ||
    (group.renderer !== FORM_GROUP_RENDERER.radio && group.renderer !== FORM_GROUP_RENDERER.tabs)
  ) {
    return true;
  }

  /*
   * Only radio/tabs renderers hide non-selected members on the client. Form
   * schema validation rejects other renderers for oneOf groups, so this rule
   * stays aligned with the island's `groupMemberVisible` implementation.
   */
  return selectedGroupRef(group, input, contacts, maps) === ref;
}

function readConditionValue(
  ref: string,
  input: RegistrationInput,
  contacts: ContactValues,
  maps: FormSchemaMaps,
  state: FormStateVisibility,
): FormValue {
  if (ref.startsWith(`${FORM_REF_PREFIX.custom}.`)) {
    if (state.visible.get(ref) === false) {
      return null;
    }

    const key = refKey(ref, FORM_REF_PREFIX.custom) ?? "";
    const value = customValue(input, key);
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? value
      : null;
  }

  if (ref.startsWith(`${FORM_REF_PREFIX.contact}.`)) {
    const kind = refKey(ref, FORM_REF_PREFIX.contact) ?? "";
    const systemRef = contactRef(kind);

    if (!groupMemberVisible(systemRef, input, contacts, maps)) {
      return null;
    }

    if (kind === CONTACT_KIND.mail) {
      return contacts.byKind.has(CONTACT_KIND.mail);
    }

    const contact = contacts.byKind.get(kind);

    if (contact === undefined) {
      return null;
    }

    if (contact.kind === CONTACT_KIND.email) {
      return contact.email;
    }

    if (contact.kind === CONTACT_KIND.phone) {
      return contact.phone;
    }

    return null;
  }

  if (ref.startsWith(`${FORM_REF_PREFIX.group}.`)) {
    const key = refKey(ref, FORM_REF_PREFIX.group) ?? "";
    const group = maps.groups.get(key);
    return group === undefined ? null : selectedGroupRef(group, input, contacts, maps);
  }

  if (ref.startsWith(`${FORM_REF_PREFIX.ticket}.`)) {
    const key = refKey(ref, FORM_REF_PREFIX.ticket) ?? "";
    return input.tickets.find((ticket) => ticket.key === key)?.quantity ?? 0;
  }

  if (ref === FORM_REF_PREFIX.consent) {
    return input.consent;
  }

  return null;
}

function computeState(
  schema: FormSchema,
  input: RegistrationInput,
  contacts: ContactValues,
  maps: FormSchemaMaps,
): FormStateVisibility {
  const conditions: Record<string, FormStateConditions> = {};

  for (const field of schema.customFields ?? []) {
    conditions[customRef(field.key)] = {
      visibleWhen: field.visibleWhen ?? null,
      requiredWhen: field.requiredWhen ?? null,
    };
  }

  return computeConditionalState({
    fields: (schema.customFields ?? []).map((field) => ({
      key: field.key,
      required: field.required === true,
    })),
    conditions,
    groupMemberVisible: (ref) => groupMemberVisible(ref, input, contacts, maps),
    readConditionValue: (ref, state) => readConditionValue(ref, input, contacts, maps, state),
  });
}

function issue(issues: RegistrationFormIssue[], ref: string, code: RegistrationFormIssue["code"]) {
  issues.push({ ref, code });
}

function validateContacts(
  schema: FormSchema,
  input: RegistrationInput,
  contacts: ContactValues,
  maps: FormSchemaMaps,
  issues: RegistrationFormIssue[],
) {
  const visible = (kind: string) => groupMemberVisible(contactRef(kind), input, contacts, maps);

  for (const kind of [CONTACT_KIND.email, CONTACT_KIND.phone, CONTACT_KIND.mail]) {
    const ref = contactRef(kind);
    const config = schema.contacts[kind];

    if (contacts.duplicates.has(kind)) {
      issue(issues, ref, REGISTRATION_VALIDATION_CODE.duplicateContact);
    }

    if (config.required === true && visible(kind) && !contacts.byKind.has(kind)) {
      issue(
        issues,
        kind === CONTACT_KIND.mail ? mailFieldName(FORM_MAIL_SUBFIELD.addressLine1) : ref,
        REGISTRATION_VALIDATION_CODE.required,
      );
    }
  }

  if (contacts.byKind.size === 0) {
    issue(issues, FORM_REF.contactEmail, REGISTRATION_VALIDATION_CODE.atLeastOneContact);
  }

  const mail = contacts.byKind.get(CONTACT_KIND.mail);

  if (mail !== undefined && mail.kind === CONTACT_KIND.mail && visible(CONTACT_KIND.mail)) {
    if (mail.province.trim().length !== 2) {
      issue(
        issues,
        mailFieldName(FORM_MAIL_SUBFIELD.province),
        REGISTRATION_VALIDATION_CODE.required,
      );
    }

    if (mail.country.trim().length !== 2) {
      issue(
        issues,
        mailFieldName(FORM_MAIL_SUBFIELD.country),
        REGISTRATION_VALIDATION_CODE.required,
      );
    }

    if (!canadianPostalCodeSchema.allows(mail.postalCode.trim().toUpperCase())) {
      issue(
        issues,
        mailFieldName(FORM_MAIL_SUBFIELD.postalCode),
        REGISTRATION_VALIDATION_CODE.invalidPostalCode,
      );
    }
  }

  const confirmationContacts = input.contacts.filter((contact) => contact.isConfirmation);
  const confirmationCount = confirmationContacts.length;
  const confirmationMode = schema.contacts.confirmation.mode;

  if (confirmationMode === FORM_CONFIRMATION_MODE.none && confirmationCount > 0) {
    issue(issues, FORM_REF.confirmation, REGISTRATION_VALIDATION_CODE.confirmationNotAllowed);
  }

  if (confirmationMode === FORM_CONFIRMATION_MODE.required && confirmationCount === 0) {
    issue(issues, FORM_REF.confirmation, REGISTRATION_VALIDATION_CODE.confirmationRequired);
  }

  if (confirmationCount > 1) {
    issue(issues, FORM_REF.confirmation, REGISTRATION_VALIDATION_CODE.confirmationMultiple);
  }

  const confirmation = confirmationContacts[0];

  if (confirmation !== undefined) {
    const method = confirmation.kind;

    if (!schema.contacts.confirmation.methods.includes(method) || !visible(method)) {
      issue(issues, FORM_REF.confirmation, REGISTRATION_VALIDATION_CODE.confirmationContact);
    }
  }
}

function validateGroups(
  schema: FormSchema,
  input: RegistrationInput,
  contacts: ContactValues,
  maps: FormSchemaMaps,
  issues: RegistrationFormIssue[],
) {
  for (const group of schema.groups ?? []) {
    if (group.required !== true) {
      continue;
    }

    const present = group.members.filter((member) => memberHasValue(member, input, contacts, maps));
    const ref = groupRef(group.key);

    if (group.mode === FORM_GROUP_MODE.oneOf && present.length !== 1) {
      issue(issues, ref, REGISTRATION_VALIDATION_CODE.groupOneOf);
    } else if (group.mode === FORM_GROUP_MODE.atLeastOne && present.length === 0) {
      issue(issues, ref, REGISTRATION_VALIDATION_CODE.groupAtLeastOne);
    } else if (group.mode === FORM_GROUP_MODE.allOf && present.length !== group.members.length) {
      issue(issues, ref, REGISTRATION_VALIDATION_CODE.groupAllOf);
    } else if (group.mode === FORM_GROUP_MODE.flat && present.length === 0) {
      issue(issues, ref, REGISTRATION_VALIDATION_CODE.groupAtLeastOne);
    }
  }
}

function isEmptyCustomValue(field: FormCustomField, value: unknown) {
  if (value == null) {
    return true;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
    return value === false;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.number) {
    return false;
  }

  return typeof value === "string" && value.trim().length === 0;
}

/** Validate one submitted answer against its stored field definition. */
function isValidCustomValue(field: FormCustomField, value: unknown, required: boolean): boolean {
  switch (field.type) {
    case FORM_CUSTOM_FIELD_TYPE.text:
    case FORM_CUSTOM_FIELD_TYPE.textarea: {
      if (typeof value !== "string") {
        return false;
      }
      const minimum = Math.max(field.minLength ?? 0, required ? 1 : 0);

      return (
        value.length >= minimum &&
        (field.maxLength === undefined || value.length <= field.maxLength)
      );
    }
    case FORM_CUSTOM_FIELD_TYPE.number: {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return false;
      }

      return (
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max)
      );
    }
    case FORM_CUSTOM_FIELD_TYPE.select:
    case FORM_CUSTOM_FIELD_TYPE.radio: {
      return (field.options ?? []).some((option) => option.value === value);
    }
    case FORM_CUSTOM_FIELD_TYPE.checkbox: {
      return typeof value === "boolean" && (!required || value);
    }
    default: {
      return false;
    }
  }
}

function customValueIssueCode(
  field: FormCustomField,
  required: boolean,
  value: unknown,
): RegistrationFormIssue["code"] {
  if (required && isEmptyCustomValue(field, value)) {
    return REGISTRATION_VALIDATION_CODE.required;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.number) {
    return REGISTRATION_VALIDATION_CODE.invalidNumber;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.select || field.type === FORM_CUSTOM_FIELD_TYPE.radio) {
    return REGISTRATION_VALIDATION_CODE.invalidOption;
  }

  return REGISTRATION_VALIDATION_CODE.invalidValue;
}

function validateCustomFields(
  schema: FormSchema,
  input: RegistrationInput,
  maps: FormSchemaMaps,
  state: FormStateVisibility,
  issues: RegistrationFormIssue[],
): Record<string, unknown> {
  const visibleFields = (schema.customFields ?? []).filter(
    (field) => state.visible.get(customRef(field.key)) !== false,
  );
  const visibleAnswers: Record<string, unknown> = {};

  for (const key of Object.keys(input.answers)) {
    if (!maps.customFields.has(key)) {
      issue(issues, customRef(key), REGISTRATION_VALIDATION_CODE.unknownAnswer);
    }
  }

  for (const field of visibleFields) {
    const value = input.answers[field.key];

    if (value === undefined) {
      continue;
    }

    const required = state.required.get(customRef(field.key)) === true;

    if (!required && isEmptyCustomValue(field, value)) {
      continue;
    }

    visibleAnswers[field.key] = value;

    if (!isValidCustomValue(field, value, required)) {
      issue(issues, customRef(field.key), customValueIssueCode(field, required, value));
    }
  }

  return visibleAnswers;
}

function validateTickets(
  schema: FormSchema,
  input: RegistrationInput,
  issues: RegistrationFormIssue[],
) {
  const allowed = new Set(
    schema.fields
      .map((field) => refKey(field.ref, FORM_REF_PREFIX.tickets))
      .filter((key): key is string => key !== null),
  );

  for (const ticket of input.tickets) {
    if (ticket.quantity > 0 && !allowed.has(ticket.key)) {
      issue(issues, ticketFieldName(ticket.key), REGISTRATION_VALIDATION_CODE.ticketUnavailable);
    }
  }
}

export function validateRegistrationForm(
  schema: FormSchema,
  input: RegistrationInput,
): RegistrationFormValidationResult {
  const issues: RegistrationFormIssue[] = [];
  const contacts = collectContacts(input.contacts);
  const maps = buildFormSchemaMaps(schema);
  const state = computeState(schema, input, contacts, maps);

  validateContacts(schema, input, contacts, maps, issues);
  validateTickets(schema, input, issues);
  validateGroups(schema, input, contacts, maps, issues);
  const answers = validateCustomFields(schema, input, maps, state, issues);

  return { issues, answers };
}
