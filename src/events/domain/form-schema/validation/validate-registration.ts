import { Value } from "@sinclair/typebox/value";
/* oxlint-disable eslint/max-params, eslint/no-continue -- Form validation passes explicit schema maps and skips non-applicable fields. */

import { CONTACT_KIND } from "~/events/domain/constants";
import { evaluateCondition } from "~/events/domain/form-schema/conditions/evaluate";
import {
  FORM_CONFIRMATION_MODE,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_GROUP_MODE,
  FORM_MAIL_SUBFIELD,
  FORM_REF,
  FORM_REF_PREFIX,
  REGISTRATION_VALIDATION_CODE,
  contactRef,
  customRef,
  groupRef,
  mailFieldName,
  refKey,
  ticketFieldName,
} from "~/events/domain/form-schema/constants";
import { customFieldAnswersSchema } from "~/events/domain/form-schema/schema/custom-field-schema";
import type {
  FormCustomField,
  FormGroup,
  FormSchema,
  RegistrationFormIssue,
  RegistrationFormValidationResult,
} from "~/events/domain/form-schema/types";
import type { ContactInput, RegistrationInput } from "~/events/domain/types";
import { LEADING_SLASH_REGEX, POSTAL_CODE_REGEX } from "~/shared/constants/patterns";

type FormValue = string | number | boolean | null | undefined;

interface FormState {
  visible: Map<string, boolean>;
  required: Map<string, boolean>;
}

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

function customValue(input: RegistrationInput, key: string): unknown {
  return input.answers[key];
}

function hasCustomValue(field: FormCustomField, value: unknown): boolean {
  if (value === undefined || value === null) {
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
  customFields: ReadonlyMap<string, FormCustomField>,
): boolean {
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
    const field = customFields.get(key);

    return field !== undefined && hasCustomValue(field, customValue(input, key));
  }

  return false;
}

function selectedGroupRef(
  group: FormGroup,
  input: RegistrationInput,
  contacts: ContactValues,
  customFields: ReadonlyMap<string, FormCustomField>,
): string | null {
  const present = group.members.filter((member) =>
    memberHasValue(member, input, contacts, customFields),
  );

  if (group.mode === FORM_GROUP_MODE.oneOf) {
    return present.length === 1 ? (present[0] ?? null) : null;
  }

  return present[0] ?? null;
}

function groupForRef(groupMap: ReadonlyMap<string, FormGroup>, ref: string): FormGroup | null {
  for (const group of groupMap.values()) {
    if (group.members.includes(ref)) {
      return group;
    }
  }

  return null;
}

function groupMemberVisible(
  ref: string,
  input: RegistrationInput,
  contacts: ContactValues,
  customFields: ReadonlyMap<string, FormCustomField>,
  groups: ReadonlyMap<string, FormGroup>,
): boolean {
  const group = groupForRef(groups, ref);

  if (group === null || group.mode !== FORM_GROUP_MODE.oneOf) {
    return true;
  }

  return selectedGroupRef(group, input, contacts, customFields) === ref;
}

function readConditionValue(
  ref: string,
  input: RegistrationInput,
  contacts: ContactValues,
  customFields: ReadonlyMap<string, FormCustomField>,
  groups: ReadonlyMap<string, FormGroup>,
  state: FormState,
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

    if (!groupMemberVisible(systemRef, input, contacts, customFields, groups)) {
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
    const group = groups.get(key);
    return group === undefined ? null : selectedGroupRef(group, input, contacts, customFields);
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
): FormState {
  const customFields = new Map((schema.customFields ?? []).map((field) => [field.key, field]));
  const groups = new Map((schema.groups ?? []).map((group) => [group.key, group]));
  const visible = new Map<string, boolean>();
  const required = new Map<string, boolean>();

  for (const field of schema.customFields ?? []) {
    const ref = customRef(field.key);
    visible.set(ref, true);
    required.set(ref, field.required === true);
  }

  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;

    for (const field of schema.customFields ?? []) {
      const ref = customRef(field.key);
      const groupVisible = groupMemberVisible(ref, input, contacts, customFields, groups);
      const conditionVisible =
        field.visibleWhen === undefined ||
        evaluateCondition(field.visibleWhen, (target) =>
          readConditionValue(target, input, contacts, customFields, groups, {
            visible,
            required,
          }),
        );
      const nextVisible = groupVisible && conditionVisible;
      const nextRequired =
        field.required === true ||
        (nextVisible &&
          field.requiredWhen !== undefined &&
          evaluateCondition(field.requiredWhen, (target) =>
            readConditionValue(target, input, contacts, customFields, groups, {
              visible,
              required,
            }),
          ));

      if (visible.get(ref) !== nextVisible || required.get(ref) !== nextRequired) {
        visible.set(ref, nextVisible);
        required.set(ref, nextRequired);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return { visible, required };
}

function issue(
  issues: RegistrationFormIssue[],
  ref: string,
  code: RegistrationFormIssue["code"],
): void {
  issues.push({ ref, code });
}

function validateContacts(
  schema: FormSchema,
  input: RegistrationInput,
  contacts: ContactValues,
  customFields: ReadonlyMap<string, FormCustomField>,
  groups: ReadonlyMap<string, FormGroup>,
  issues: RegistrationFormIssue[],
): void {
  const visible = (kind: string): boolean =>
    groupMemberVisible(contactRef(kind), input, contacts, customFields, groups);

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

    if (!POSTAL_CODE_REGEX.test(mail.postalCode.trim().toUpperCase())) {
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
  customFields: ReadonlyMap<string, FormCustomField>,
  issues: RegistrationFormIssue[],
): void {
  for (const group of schema.groups ?? []) {
    if (group.required !== true) {
      continue;
    }

    const present = group.members.filter((member) =>
      memberHasValue(member, input, contacts, customFields),
    );
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

function isEmptyCustomValue(field: FormCustomField, value: unknown): boolean {
  if (value === null || value === undefined) {
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
  state: FormState,
  issues: RegistrationFormIssue[],
): Record<string, unknown> {
  const customFields = new Map((schema.customFields ?? []).map((field) => [field.key, field]));
  const visibleFields = (schema.customFields ?? []).filter(
    (field) => state.visible.get(customRef(field.key)) !== false,
  );
  const visibleAnswers: Record<string, unknown> = {};

  for (const key of Object.keys(input.answers)) {
    if (!customFields.has(key)) {
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
  }

  const answersSchema = customFieldAnswersSchema(visibleFields, state.required);

  if (Value.Check(answersSchema, visibleAnswers)) {
    return visibleAnswers;
  }

  const seen = new Set<string>();

  for (const error of Value.Errors(answersSchema, visibleAnswers)) {
    const key = error.path.replace(LEADING_SLASH_REGEX, "").split("/")[0] ?? "";
    const field = customFields.get(key);

    if (field === undefined) {
      continue;
    }

    const ref = customRef(key);

    if (seen.has(ref)) {
      continue;
    }

    seen.add(ref);
    issue(
      issues,
      ref,
      customValueIssueCode(field, state.required.get(ref) === true, visibleAnswers[key]),
    );
  }

  return visibleAnswers;
}

function validateTickets(
  schema: FormSchema,
  input: RegistrationInput,
  issues: RegistrationFormIssue[],
): void {
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
  const customFields = new Map((schema.customFields ?? []).map((field) => [field.key, field]));
  const state = computeState(schema, input, contacts);

  const groups = new Map((schema.groups ?? []).map((group) => [group.key, group]));
  validateContacts(schema, input, contacts, customFields, groups, issues);
  validateTickets(schema, input, issues);
  validateGroups(schema, input, contacts, customFields, issues);
  const answers = validateCustomFields(schema, input, state, issues);

  return { issues, answers };
}
