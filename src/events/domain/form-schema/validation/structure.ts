/* oxlint-disable eslint/max-params -- Validation helpers take explicit context instead of a mutable state object. */

import {
  FORM_CONFIRMATION_MODE,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_FIELD_WIDTH,
  FORM_GROUP_MODE,
  FORM_GROUP_RENDERER,
  FORM_REF_PREFIX,
  FORM_VALIDATION_MODE,
  RESERVED_CUSTOM_FIELD_KEY,
  isContactRef,
  refKey,
} from "~/events/domain/form-schema/constants";
import type { FormSchemaIssues } from "~/events/domain/form-schema/issues";
import type {
  FormContactsConfig,
  FormCustomField,
  FormGroup,
  FormSchema,
  FormSchemaValidationOptions,
} from "~/events/domain/form-schema/types";

const RESERVED_CUSTOM_KEYS = new Set<string>(Object.values(RESERVED_CUSTOM_FIELD_KEY));

const TEXT_PROPERTIES = ["minLength", "maxLength"] as const;
const NUMBER_PROPERTIES = ["min", "max", "step"] as const;
const OPTION_PROPERTIES = ["options"] as const;
const ROW_PROPERTIES = ["rows"] as const;

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

function rejectProperties(
  field: FormCustomField,
  path: string,
  properties: readonly string[],
  issues: FormSchemaIssues,
): void {
  const record = field as unknown as Record<string, unknown>;

  for (const property of properties) {
    if (record[property] !== undefined) {
      issues.error(
        `${path}.${property}`,
        "property_not_allowed",
        `${property} is not allowed for a ${field.type} field.`,
      );
    }
  }
}

function validateLengthBounds(
  field: FormCustomField,
  path: string,
  issues: FormSchemaIssues,
): void {
  if (
    field.minLength !== undefined &&
    field.maxLength !== undefined &&
    field.maxLength < field.minLength
  ) {
    issues.error(
      `${path}.maxLength`,
      "invalid_bounds",
      "maxLength must be greater than or equal to minLength.",
    );
  }

  if (
    typeof field.defaultValue === "string" &&
    field.maxLength !== undefined &&
    field.defaultValue.length > field.maxLength
  ) {
    issues.error(
      `${path}.defaultValue`,
      "invalid_default",
      "defaultValue is longer than maxLength.",
    );
  }
}

function validateNumberBounds(
  field: FormCustomField,
  path: string,
  issues: FormSchemaIssues,
): void {
  if (field.min !== undefined && field.max !== undefined && field.max < field.min) {
    issues.error(`${path}.max`, "invalid_bounds", "max must be greater than or equal to min.");
  }

  if (typeof field.defaultValue !== "number") {
    if (field.defaultValue !== undefined) {
      issues.error(
        `${path}.defaultValue`,
        "invalid_default",
        "defaultValue must be a number for a number field.",
      );
    }

    return;
  }

  if (field.min !== undefined && field.defaultValue < field.min) {
    issues.error(`${path}.defaultValue`, "invalid_default", "defaultValue is below min.");
  }

  if (field.max !== undefined && field.defaultValue > field.max) {
    issues.error(`${path}.defaultValue`, "invalid_default", "defaultValue is above max.");
  }
}

function validateDefaultForOptions(
  field: FormCustomField,
  path: string,
  issues: FormSchemaIssues,
): void {
  if (field.defaultValue === undefined) {
    return;
  }

  if (typeof field.defaultValue !== "string") {
    issues.error(
      `${path}.defaultValue`,
      "invalid_default",
      "defaultValue must be a string for a select or radio field.",
    );
    return;
  }

  if (!field.options?.some((option) => option.value === field.defaultValue)) {
    issues.error(
      `${path}.defaultValue`,
      "invalid_default",
      "defaultValue must match one of the field options.",
    );
  }
}

function validateOptions(field: FormCustomField, path: string, issues: FormSchemaIssues): void {
  if (field.options === undefined) {
    issues.error(`${path}.options`, "missing_options", `${field.type} fields require options.`);
    return;
  }

  const values = new Set<string>();

  for (const [index, option] of field.options.entries()) {
    if (values.has(option.value)) {
      issues.error(
        `${path}.options.${index}.value`,
        "duplicate_option_value",
        "Option values must be unique.",
      );
    }

    values.add(option.value);
  }

  validateDefaultForOptions(field, path, issues);
}

function validateTextLikeField(
  field: FormCustomField,
  path: string,
  issues: FormSchemaIssues,
  allowRows: boolean,
): void {
  rejectProperties(field, path, OPTION_PROPERTIES, issues);
  rejectProperties(field, path, NUMBER_PROPERTIES, issues);

  if (!allowRows) {
    rejectProperties(field, path, ROW_PROPERTIES, issues);
  }

  validateLengthBounds(field, path, issues);

  if (field.defaultValue !== undefined && typeof field.defaultValue !== "string") {
    issues.error(
      `${path}.defaultValue`,
      "invalid_default",
      "defaultValue must be a string for a text field.",
    );
  }
}

function validateCustomField(field: FormCustomField, path: string, issues: FormSchemaIssues): void {
  switch (field.type) {
    case FORM_CUSTOM_FIELD_TYPE.text: {
      validateTextLikeField(field, path, issues, false);
      break;
    }
    case FORM_CUSTOM_FIELD_TYPE.textarea: {
      validateTextLikeField(field, path, issues, true);
      break;
    }
    case FORM_CUSTOM_FIELD_TYPE.number: {
      rejectProperties(field, path, OPTION_PROPERTIES, issues);
      rejectProperties(field, path, TEXT_PROPERTIES, issues);
      rejectProperties(field, path, ROW_PROPERTIES, issues);
      validateNumberBounds(field, path, issues);
      break;
    }
    case FORM_CUSTOM_FIELD_TYPE.select:
    case FORM_CUSTOM_FIELD_TYPE.radio: {
      rejectProperties(field, path, TEXT_PROPERTIES, issues);
      rejectProperties(field, path, NUMBER_PROPERTIES, issues);
      rejectProperties(field, path, ROW_PROPERTIES, issues);
      validateOptions(field, path, issues);
      break;
    }
    case FORM_CUSTOM_FIELD_TYPE.checkbox: {
      rejectProperties(field, path, OPTION_PROPERTIES, issues);
      rejectProperties(field, path, TEXT_PROPERTIES, issues);
      rejectProperties(field, path, NUMBER_PROPERTIES, issues);
      rejectProperties(field, path, ROW_PROPERTIES, issues);

      if (field.defaultValue !== undefined && typeof field.defaultValue !== "boolean") {
        issues.error(
          `${path}.defaultValue`,
          "invalid_default",
          "defaultValue must be a boolean for a checkbox field.",
        );
      }
      break;
    }
    default: {
      break;
    }
  }
}

export function validateSections(schema: FormSchema, issues: FormSchemaIssues): void {
  const keys = new Set<string>();

  for (const [index, section] of schema.sections.entries()) {
    if (keys.has(section.key)) {
      issues.error(
        `sections.${index}.key`,
        "duplicate_section_key",
        `Section key "${section.key}" is duplicated.`,
      );
    }

    keys.add(section.key);
  }
}

export function validateContacts(
  contacts: FormContactsConfig,
  mode: FormSchemaValidationOptions["mode"],
  issues: FormSchemaIssues,
): void {
  const { confirmation } = contacts;
  const methods = new Set(confirmation.methods);

  if (methods.size !== confirmation.methods.length) {
    issues.error(
      "contacts.confirmation.methods",
      "duplicate_confirmation_method",
      "Confirmation methods must be unique.",
    );
  }

  if (confirmation.mode === FORM_CONFIRMATION_MODE.none && confirmation.methods.length > 0) {
    issues.error(
      "contacts.confirmation.methods",
      "confirmation_methods_not_allowed",
      "Confirmation methods must be empty when mode is none.",
    );
  }

  if (confirmation.mode !== FORM_CONFIRMATION_MODE.none && confirmation.methods.length === 0) {
    issues.error(
      "contacts.confirmation.methods",
      "missing_confirmation_method",
      "At least one confirmation method is required unless mode is none.",
    );
  }

  if (contacts.mail.width !== FORM_FIELD_WIDTH.full) {
    widthIssue(issues, mode, "contacts.mail.width", "The mail contact must use full width.");
  }
}

export function validateCustomFields(schema: FormSchema, issues: FormSchemaIssues): void {
  const keys = new Set<string>();
  const fields = schema.customFields ?? [];

  for (const [index, field] of fields.entries()) {
    const path = `customFields.${index}`;

    if (keys.has(field.key)) {
      issues.error(
        `${path}.key`,
        "duplicate_custom_key",
        `Custom field key "${field.key}" is duplicated.`,
      );
    }

    keys.add(field.key);

    if (RESERVED_CUSTOM_KEYS.has(field.key)) {
      issues.error(
        `${path}.key`,
        "reserved_custom_key",
        `Custom field key "${field.key}" is reserved.`,
      );
    }

    validateCustomField(field, path, issues);
  }
}

function validateGroupMembers(
  group: FormGroup,
  index: number,
  customKeys: ReadonlySet<string>,
  membership: Map<string, string>,
  issues: FormSchemaIssues,
): void {
  const path = `groups.${index}`;
  const members = new Set<string>();

  for (const [memberIndex, member] of group.members.entries()) {
    if (members.has(member)) {
      issues.error(
        `${path}.members.${memberIndex}`,
        "duplicate_group_member",
        "Group members must be unique.",
      );
    }

    members.add(member);

    const existingGroup = membership.get(member);

    if (existingGroup === undefined) {
      const customKey = refKey(member, FORM_REF_PREFIX.custom);
      const groupable = isContactRef(member) || (customKey !== null && customKeys.has(customKey));

      if (groupable) {
        membership.set(member, group.key);
      } else {
        issues.error(
          `${path}.members.${memberIndex}`,
          "invalid_group_member",
          `"${member}" is not a groupable contact or custom field.`,
        );
      }
    } else {
      issues.error(
        `${path}.members.${memberIndex}`,
        "member_in_multiple_groups",
        `"${member}" already belongs to group "${existingGroup}".`,
      );
    }
  }
}

function validateGroupOptions(group: FormGroup, index: number, issues: FormSchemaIssues): void {
  const path = `groups.${index}`;
  const requiresOptions =
    group.renderer === FORM_GROUP_RENDERER.radio || group.renderer === FORM_GROUP_RENDERER.tabs;

  if (group.options === undefined) {
    if (requiresOptions) {
      issues.error(
        `${path}.options`,
        "missing_group_options",
        `${group.renderer} groups require options.`,
      );
    }

    return;
  }

  const optionRefs = new Set<string>();

  for (const [optionIndex, option] of group.options.entries()) {
    if (optionRefs.has(option.ref)) {
      issues.error(
        `${path}.options.${optionIndex}.ref`,
        "duplicate_group_option",
        "Group option refs must be unique.",
      );
    }

    optionRefs.add(option.ref);

    if (!group.members.includes(option.ref)) {
      issues.error(
        `${path}.options.${optionIndex}.ref`,
        "invalid_group_option",
        `"${option.ref}" is not a member of this group.`,
      );
    }
  }

  for (const [memberIndex, member] of group.members.entries()) {
    if (!optionRefs.has(member)) {
      issues.error(
        `${path}.members.${memberIndex}`,
        "missing_group_option",
        `"${member}" has no group option.`,
      );
    }
  }
}

function validateGroup(
  group: FormGroup,
  index: number,
  customKeys: ReadonlySet<string>,
  membership: Map<string, string>,
  mode: FormSchemaValidationOptions["mode"],
  issues: FormSchemaIssues,
): void {
  const path = `groups.${index}`;

  validateGroupMembers(group, index, customKeys, membership, issues);
  validateGroupOptions(group, index, issues);

  if (group.default !== undefined) {
    if (group.mode !== FORM_GROUP_MODE.oneOf) {
      issues.error(
        `${path}.default`,
        "invalid_group_default",
        "default is only allowed for oneOf groups.",
      );
    } else if (!group.members.includes(group.default)) {
      issues.error(
        `${path}.default`,
        "invalid_group_default",
        "default must be a member of the group.",
      );
    }
  }

  if (group.width !== FORM_FIELD_WIDTH.full) {
    widthIssue(issues, mode, `${path}.width`, "Groups must use full width.");
  }

  if (group.mode === FORM_GROUP_MODE.allOf && group.required !== true) {
    issues.warning(
      `${path}.required`,
      "all_of_should_be_required",
      "allOf groups should set required to true.",
    );
  }
}

export function validateGroups(
  schema: FormSchema,
  mode: FormSchemaValidationOptions["mode"],
  issues: FormSchemaIssues,
): ReadonlyMap<string, string> {
  const groups = schema.groups ?? [];
  const customKeys = new Set((schema.customFields ?? []).map((field) => field.key));
  const keys = new Set<string>();
  const membership = new Map<string, string>();

  for (const [index, group] of groups.entries()) {
    if (keys.has(group.key)) {
      issues.error(
        `groups.${index}.key`,
        "duplicate_group_key",
        `Group key "${group.key}" is duplicated.`,
      );
    }

    keys.add(group.key);
    validateGroup(group, index, customKeys, membership, mode, issues);
  }

  return membership;
}
