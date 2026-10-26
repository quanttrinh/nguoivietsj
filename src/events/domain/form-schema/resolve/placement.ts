/* oxlint-disable eslint/max-params -- Placement checks take explicit sets and paths instead of a mutable context. */

import {
  FORM_CONFIRMATION_MODE,
  FORM_CONTACT_REF_VALUES,
  FORM_FIELD_WIDTH,
  FORM_REF,
  FORM_REF_PREFIX,
  FORM_VALIDATION_MODE,
  customRef,
  groupRef,
  isContactRef,
  isCustomRef,
  isGroupRef,
  isStaticFormRef,
  isSystemTicketRef,
  refKey,
  requiresFullWidthRef,
  ticketRef,
} from "~/events/domain/form-schema/constants";
import type { FormSchemaIssues } from "~/events/domain/form-schema/issues";
import type {
  FormGroup,
  FormSchema,
  FormSchemaValidationOptions,
} from "~/events/domain/form-schema/types";

function missingIssue(
  issues: FormSchemaIssues,
  mode: FormSchemaValidationOptions["mode"],
  path: string,
  code: string,
  message: string,
): void {
  if (mode === FORM_VALIDATION_MODE.publish) {
    issues.error(path, code, message);
  } else {
    issues.warning(path, code, message);
  }
}

function widthIssue(
  issues: FormSchemaIssues,
  mode: FormSchemaValidationOptions["mode"],
  path: string,
  message: string,
): void {
  if (mode === FORM_VALIDATION_MODE.publish) {
    issues.error(path, "invalid_width", message);
  } else {
    issues.warning(path, "invalid_width", message);
  }
}

function isKnownRef(
  ref: string,
  groupKeys: ReadonlySet<string>,
  customKeys: ReadonlySet<string>,
  activeTicketKeys: ReadonlySet<string>,
  issues: FormSchemaIssues,
  path: string,
): boolean {
  if (isStaticFormRef(ref)) {
    return true;
  }

  if (isSystemTicketRef(ref)) {
    const key = refKey(ref, FORM_REF_PREFIX.tickets) ?? "";

    if (activeTicketKeys.has(key)) {
      return true;
    }

    issues.error(
      `${path}.ref`,
      "unknown_ticket_ref",
      `"${ref}" does not reference an active ticket type.`,
    );
    return false;
  }

  if (isGroupRef(ref)) {
    const key = refKey(ref, FORM_REF_PREFIX.group) ?? "";

    if (groupKeys.has(key)) {
      return true;
    }

    issues.error(`${path}.ref`, "unknown_group_ref", `"${ref}" does not reference a group.`);
    return false;
  }

  if (isCustomRef(ref)) {
    const key = refKey(ref, FORM_REF_PREFIX.custom) ?? "";

    if (customKeys.has(key)) {
      return true;
    }

    issues.error(
      `${path}.ref`,
      "unknown_custom_ref",
      `"${ref}" does not reference a custom field.`,
    );
    return false;
  }

  issues.error(`${path}.ref`, "unknown_ref", `"${ref}" is not a valid field reference.`);
  return false;
}

function addFieldRef(
  ref: string,
  counts: Map<string, number>,
  issues: FormSchemaIssues,
  path: string,
): void {
  const count = counts.get(ref) ?? 0;

  if (count > 0) {
    issues.error(`${path}.ref`, "duplicate_ref", `"${ref}" is placed more than once.`);
  }

  counts.set(ref, count + 1);
}

function effectiveRefs(
  fieldRefs: ReadonlySet<string>,
  groupsByKey: ReadonlyMap<string, FormGroup>,
): Set<string> {
  const refs = new Set(fieldRefs);

  for (const ref of fieldRefs) {
    if (isGroupRef(ref)) {
      const group = groupsByKey.get(refKey(ref, FORM_REF_PREFIX.group) ?? "");

      if (group !== undefined) {
        for (const member of group.members) {
          refs.add(member);
        }
      }
    }
  }

  return refs;
}

function requirePlaced(
  ref: string,
  refs: ReadonlySet<string>,
  issues: FormSchemaIssues,
  mode: FormSchemaValidationOptions["mode"],
  code: string,
  message: string,
): void {
  if (!refs.has(ref)) {
    missingIssue(issues, mode, "fields", code, message);
  }
}

function requireSingleField(
  ref: string,
  counts: ReadonlyMap<string, number>,
  issues: FormSchemaIssues,
  mode: FormSchemaValidationOptions["mode"],
  code: string,
  message: string,
): void {
  const count = counts.get(ref) ?? 0;

  if (count === 0) {
    missingIssue(issues, mode, "fields", code, message);
  }
}

function validateFieldPlacement(
  schema: FormSchema,
  options: FormSchemaValidationOptions,
  issues: FormSchemaIssues,
): { counts: Map<string, number>; fieldRefs: Set<string> } {
  const sectionKeys = new Set(schema.sections.map((section) => section.key));
  const groupKeys = new Set((schema.groups ?? []).map((group) => group.key));
  const customKeys = new Set((schema.customFields ?? []).map((field) => field.key));
  const activeTicketKeys = new Set(options.activeTicketTypeKeys);
  const groupMembership = new Map<string, string>();

  for (const group of schema.groups ?? []) {
    for (const member of group.members) {
      groupMembership.set(member, group.key);
    }
  }

  const counts = new Map<string, number>();
  const fieldRefs = new Set<string>();

  for (const [index, field] of schema.fields.entries()) {
    const path = `fields.${index}`;

    if (!sectionKeys.has(field.section)) {
      issues.error(
        `${path}.section`,
        "unknown_section",
        `"${field.section}" does not reference a section.`,
      );
    }

    if (groupMembership.has(field.ref)) {
      issues.error(
        `${path}.ref`,
        "grouped_field_placed_individually",
        `"${field.ref}" is a group member and must be placed through its group.`,
      );
    }

    if (requiresFullWidthRef(field.ref) && field.width !== FORM_FIELD_WIDTH.full) {
      widthIssue(issues, options.mode, `${path}.width`, `"${field.ref}" must use full width.`);
    }

    isKnownRef(field.ref, groupKeys, customKeys, activeTicketKeys, issues, path);
    addFieldRef(field.ref, counts, issues, path);
    fieldRefs.add(field.ref);
  }

  return { counts, fieldRefs };
}

function validateSectionContent(
  schema: FormSchema,
  options: FormSchemaValidationOptions,
  issues: FormSchemaIssues,
): void {
  if (schema.sections.length === 0) {
    missingIssue(
      issues,
      options.mode,
      "sections",
      "missing_sections",
      "At least one section is required.",
    );
  }

  if (schema.fields.length === 0) {
    missingIssue(
      issues,
      options.mode,
      "fields",
      "missing_fields",
      "At least one field placement is required.",
    );
  }

  const populated = new Set(schema.fields.map((field) => field.section));

  for (const [index, section] of schema.sections.entries()) {
    if (!populated.has(section.key)) {
      missingIssue(
        issues,
        options.mode,
        `sections.${index}.key`,
        "empty_section",
        `Section "${section.key}" has no fields.`,
      );
    }
  }
}

function hasRequiredContact(schema: FormSchema): boolean {
  const { contacts } = schema;

  if (
    contacts.email.required === true ||
    contacts.phone.required === true ||
    contacts.mail.required === true
  ) {
    return true;
  }

  return (schema.groups ?? []).some(
    (group) => group.required === true && group.members.some((member) => isContactRef(member)),
  );
}

function validateContactRequirement(
  schema: FormSchema,
  options: FormSchemaValidationOptions,
  issues: FormSchemaIssues,
): void {
  if (!hasRequiredContact(schema)) {
    missingIssue(
      issues,
      options.mode,
      "contacts",
      "missing_required_contact",
      "At least one contact must be required directly or through a required group.",
    );
  }
}

function validateRequiredRefs(
  schema: FormSchema,
  options: FormSchemaValidationOptions,
  counts: ReadonlyMap<string, number>,
  refs: ReadonlySet<string>,
  issues: FormSchemaIssues,
): void {
  requireSingleField(
    FORM_REF.fullName,
    counts,
    issues,
    options.mode,
    "missing_full_name",
    `${FORM_REF.fullName} must be placed exactly once.`,
  );
  requireSingleField(
    FORM_REF.consent,
    counts,
    issues,
    options.mode,
    "missing_consent",
    `${FORM_REF.consent} must be placed exactly once.`,
  );

  const confirmationMode = schema.contacts.confirmation.mode;
  const confirmationCount = counts.get(FORM_REF.confirmation) ?? 0;

  if (confirmationMode === FORM_CONFIRMATION_MODE.none && confirmationCount > 0) {
    issues.error(
      "fields",
      "confirmation_not_allowed",
      `${FORM_REF.confirmation} must not be placed when confirmation mode is none.`,
    );
  }

  if (confirmationMode !== FORM_CONFIRMATION_MODE.none && confirmationCount === 0) {
    missingIssue(
      issues,
      options.mode,
      "fields",
      "missing_confirmation",
      `${FORM_REF.confirmation} must be placed when confirmation is enabled.`,
    );
  }

  for (const ref of FORM_CONTACT_REF_VALUES) {
    requirePlaced(
      ref,
      refs,
      issues,
      options.mode,
      "missing_contact",
      `${ref} must be placed exactly once.`,
    );
  }

  for (const group of schema.groups ?? []) {
    requireSingleField(
      groupRef(group.key),
      counts,
      issues,
      options.mode,
      "missing_group",
      `${groupRef(group.key)} must be placed exactly once.`,
    );
  }

  for (const field of schema.customFields ?? []) {
    requirePlaced(
      customRef(field.key),
      refs,
      issues,
      options.mode,
      "missing_custom_field",
      `${customRef(field.key)} must be placed exactly once.`,
    );
  }

  for (const key of options.activeTicketTypeKeys) {
    requireSingleField(
      ticketRef(key),
      counts,
      issues,
      options.mode,
      "missing_ticket",
      `${ticketRef(key)} must be placed exactly once.`,
    );
  }
}

export function validatePlacement(
  schema: FormSchema,
  options: FormSchemaValidationOptions,
  issues: FormSchemaIssues,
): void {
  const { counts, fieldRefs } = validateFieldPlacement(schema, options, issues);
  const groupsByKey = new Map((schema.groups ?? []).map((group) => [group.key, group]));
  const refs = effectiveRefs(fieldRefs, groupsByKey);

  validateSectionContent(schema, options, issues);
  validateContactRequirement(schema, options, issues);
  validateRequiredRefs(schema, options, counts, refs, issues);
}
