import { CONTACT_KIND } from "~/events/domain/constants";
/* oxlint-disable eslint/max-params -- Condition validation keeps explicit field and path inputs for clear issue paths. */
import {
  conditionDepth,
  countConditionNodes,
} from "~/events/domain/form-schema/conditions/condition-tree";
import {
  FORM_CONDITION_NODE,
  FORM_CONDITION_OPERATOR,
  FORM_CONDITION_TARGET,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_REF_PREFIX,
  contactKindFromConditionRef,
  isContactConditionRef,
  isCustomRef,
  isGroupConditionRef,
  isTicketConditionRef,
  refKey,
} from "~/events/domain/form-schema/constants";
import type { FormSchemaIssues } from "~/events/domain/form-schema/issues";
import type {
  FormCondition,
  FormContactKind,
  FormCustomField,
  FormGroup,
  FormSchema,
  FormSchemaValidationOptions,
} from "~/events/domain/form-schema/types";
import {
  MAX_FORM_SCHEMA_CONDITIONS,
  MAX_FORM_SCHEMA_CONDITIONS_PER_FIELD,
  MAX_FORM_SCHEMA_CONDITION_DEPTH,
} from "~/events/domain/limits";

type ConditionTarget =
  | { kind: typeof FORM_CONDITION_TARGET.custom; field: FormCustomField }
  | { kind: typeof FORM_CONDITION_TARGET.contact; contact: FormContactKind }
  | { kind: typeof FORM_CONDITION_TARGET.group; group: FormGroup }
  | { kind: typeof FORM_CONDITION_TARGET.ticket }
  | { kind: typeof FORM_CONDITION_TARGET.consent };

interface ConditionContext {
  customFields: ReadonlyMap<string, FormCustomField>;
  groups: ReadonlyMap<string, FormGroup>;
  activeTicketKeys: ReadonlySet<string>;
  issues: FormSchemaIssues;
}

function collectCustomRefs(condition: FormCondition, refs: Set<string>): void {
  if (FORM_CONDITION_NODE.all in condition) {
    for (const child of condition.all) {
      collectCustomRefs(child, refs);
    }
    return;
  }

  if (FORM_CONDITION_NODE.any in condition) {
    for (const child of condition.any) {
      collectCustomRefs(child, refs);
    }
    return;
  }

  if (FORM_CONDITION_NODE.not in condition) {
    collectCustomRefs(condition.not, refs);
    return;
  }

  if (isCustomRef(condition.field)) {
    refs.add(refKey(condition.field, FORM_REF_PREFIX.custom) ?? "");
  }
}

function resolveTarget(
  ref: string,
  currentFieldKey: string,
  context: ConditionContext,
  path: string,
): ConditionTarget | null {
  if (isCustomRef(ref)) {
    const key = refKey(ref, FORM_REF_PREFIX.custom) ?? "";
    const field = context.customFields.get(key);

    if (field === undefined) {
      context.issues.error(`${path}.field`, "unknown_condition_ref", `"${ref}" does not exist.`);
      return null;
    }

    if (key === currentFieldKey) {
      context.issues.error(
        `${path}.field`,
        "self_referencing_condition",
        "A custom field cannot reference itself.",
      );
      return null;
    }

    return { kind: FORM_CONDITION_TARGET.custom, field };
  }

  if (isContactConditionRef(ref)) {
    return {
      kind: FORM_CONDITION_TARGET.contact,
      contact: contactKindFromConditionRef(ref) as FormContactKind,
    };
  }

  if (isGroupConditionRef(ref)) {
    const key = refKey(ref, FORM_REF_PREFIX.group) ?? "";
    const group = context.groups.get(key);

    if (group === undefined) {
      context.issues.error(`${path}.field`, "unknown_condition_ref", `"${ref}" does not exist.`);
      return null;
    }

    return { kind: FORM_CONDITION_TARGET.group, group };
  }

  if (isTicketConditionRef(ref)) {
    const key = refKey(ref, FORM_REF_PREFIX.ticket) ?? "";

    if (!context.activeTicketKeys.has(key)) {
      context.issues.error(
        `${path}.field`,
        "unknown_condition_ref",
        `"${ref}" does not reference an active ticket type.`,
      );
      return null;
    }

    return { kind: FORM_CONDITION_TARGET.ticket };
  }

  if (ref === FORM_REF_PREFIX.consent) {
    return { kind: FORM_CONDITION_TARGET.consent };
  }

  context.issues.error(`${path}.field`, "unknown_condition_ref", `"${ref}" is not supported.`);
  return null;
}

function typeError(path: string, message: string, issues: FormSchemaIssues): void {
  issues.error(`${path}.value`, "invalid_condition_value", message);
}

function validateCustomEquality(
  field: FormCustomField,
  value: string | number | boolean,
  path: string,
  issues: FormSchemaIssues,
): void {
  if (
    field.type === FORM_CUSTOM_FIELD_TYPE.text ||
    field.type === FORM_CUSTOM_FIELD_TYPE.textarea
  ) {
    if (typeof value !== "string") {
      typeError(path, "Text conditions require a string value.", issues);
    }
    return;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.number) {
    if (typeof value !== "number") {
      typeError(path, "Number conditions require a numeric value.", issues);
    }
    return;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
    if (typeof value !== "boolean") {
      typeError(path, "Checkbox conditions require a boolean value.", issues);
    }
    return;
  }

  if (typeof value !== "string") {
    typeError(path, "Select and radio conditions require a string value.", issues);
    return;
  }

  if (!field.options?.some((option) => option.value === value)) {
    typeError(path, "Condition value must be one of the field options.", issues);
  }
}

function validateEquality(
  target: ConditionTarget,
  value: string | number | boolean,
  path: string,
  issues: FormSchemaIssues,
): void {
  if (target.kind === FORM_CONDITION_TARGET.custom) {
    validateCustomEquality(target.field, value, path, issues);
    return;
  }

  if (target.kind === FORM_CONDITION_TARGET.contact) {
    if (target.contact === CONTACT_KIND.mail) {
      issues.error(
        `${path}.op`,
        "invalid_condition_operator",
        "Mail contact conditions only support exists and notExists.",
      );
    } else if (typeof value !== "string") {
      typeError(path, "Contact conditions require a string value.", issues);
    }
    return;
  }

  if (target.kind === FORM_CONDITION_TARGET.group) {
    if (typeof value !== "string") {
      typeError(path, "Group conditions require a member ref string.", issues);
    } else if (!target.group.members.includes(value)) {
      typeError(path, "Group condition value must be a group member.", issues);
    }
    return;
  }

  if (target.kind === FORM_CONDITION_TARGET.ticket) {
    if (typeof value !== "number") {
      typeError(path, "Ticket conditions require a numeric value.", issues);
    }
    return;
  }

  if (typeof value !== "boolean") {
    typeError(path, "Consent conditions require a boolean value.", issues);
  }
}

function validateStringMembership(
  values: readonly (string | number | boolean)[],
  path: string,
  issues: FormSchemaIssues,
): boolean {
  if (!values.every((value) => typeof value === "string")) {
    typeError(path, "This condition requires string values.", issues);
    return false;
  }

  return true;
}

function validateNumberMembership(
  values: readonly (string | number | boolean)[],
  path: string,
  issues: FormSchemaIssues,
): boolean {
  if (!values.every((value) => typeof value === "number")) {
    typeError(path, "This condition requires numeric values.", issues);
    return false;
  }

  return true;
}

function validateBooleanMembership(
  values: readonly (string | number | boolean)[],
  path: string,
  issues: FormSchemaIssues,
): boolean {
  if (!values.every((value) => typeof value === "boolean")) {
    typeError(path, "This condition requires boolean values.", issues);
    return false;
  }

  return true;
}

function validateCustomMembership(
  field: FormCustomField,
  values: readonly (string | number | boolean)[],
  path: string,
  issues: FormSchemaIssues,
): void {
  if (
    field.type === FORM_CUSTOM_FIELD_TYPE.text ||
    field.type === FORM_CUSTOM_FIELD_TYPE.textarea
  ) {
    validateStringMembership(values, path, issues);
    return;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.number) {
    validateNumberMembership(values, path, issues);
    return;
  }

  if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
    validateBooleanMembership(values, path, issues);
    return;
  }

  if (!validateStringMembership(values, path, issues)) {
    return;
  }

  const options = new Set<string>();

  for (const option of field.options ?? []) {
    options.add(option.value);
  }

  for (const value of values) {
    if (typeof value === "string" && !options.has(value)) {
      typeError(path, "Every condition value must be one of the field options.", issues);
      return;
    }
  }
}

function validateMembership(
  target: ConditionTarget,
  values: readonly (string | number | boolean)[],
  path: string,
  issues: FormSchemaIssues,
): void {
  if (new Set(values).size !== values.length) {
    typeError(path, "Condition values must be unique.", issues);
  }

  if (target.kind === FORM_CONDITION_TARGET.custom) {
    validateCustomMembership(target.field, values, path, issues);
    return;
  }

  if (target.kind === FORM_CONDITION_TARGET.contact) {
    if (target.contact === CONTACT_KIND.mail) {
      issues.error(
        `${path}.op`,
        "invalid_condition_operator",
        "Mail contact conditions only support exists and notExists.",
      );
    } else {
      validateStringMembership(values, path, issues);
    }
    return;
  }

  if (target.kind === FORM_CONDITION_TARGET.group) {
    if (!validateStringMembership(values, path, issues)) {
      return;
    }

    for (const value of values) {
      if (typeof value === "string" && !target.group.members.includes(value)) {
        typeError(path, "Every group condition value must be a member.", issues);
        return;
      }
    }
    return;
  }

  if (target.kind === FORM_CONDITION_TARGET.ticket) {
    validateNumberMembership(values, path, issues);
    return;
  }

  validateBooleanMembership(values, path, issues);
}

function validateNumericComparison(
  target: ConditionTarget,
  value: number,
  path: string,
  issues: FormSchemaIssues,
): void {
  const numeric =
    target.kind === FORM_CONDITION_TARGET.ticket ||
    (target.kind === FORM_CONDITION_TARGET.custom &&
      target.field.type === FORM_CUSTOM_FIELD_TYPE.number);

  if (!numeric) {
    issues.error(
      `${path}.op`,
      "invalid_condition_operator",
      "Numeric comparisons require a number field or ticket quantity.",
    );
    return;
  }

  if (typeof value !== "number") {
    typeError(path, "Numeric comparisons require a numeric value.", issues);
  }
}

function validateCondition(
  condition: FormCondition,
  path: string,
  currentFieldKey: string,
  context: ConditionContext,
): void {
  if (FORM_CONDITION_NODE.all in condition) {
    for (const [index, child] of condition.all.entries()) {
      validateCondition(child, `${path}.all.${index}`, currentFieldKey, context);
    }
    return;
  }

  if (FORM_CONDITION_NODE.any in condition) {
    for (const [index, child] of condition.any.entries()) {
      validateCondition(child, `${path}.any.${index}`, currentFieldKey, context);
    }
    return;
  }

  if (FORM_CONDITION_NODE.not in condition) {
    validateCondition(condition.not, `${path}.not`, currentFieldKey, context);
    return;
  }

  const target = resolveTarget(condition.field, currentFieldKey, context, path);

  if (target === null) {
    return;
  }

  if (
    condition.op === FORM_CONDITION_OPERATOR.equals ||
    condition.op === FORM_CONDITION_OPERATOR.notEquals
  ) {
    validateEquality(target, condition.value, path, context.issues);
    return;
  }

  if (
    condition.op === FORM_CONDITION_OPERATOR.in ||
    condition.op === FORM_CONDITION_OPERATOR.notIn
  ) {
    validateMembership(target, condition.value, path, context.issues);
    return;
  }

  if (
    condition.op === FORM_CONDITION_OPERATOR.gt ||
    condition.op === FORM_CONDITION_OPERATOR.gte ||
    condition.op === FORM_CONDITION_OPERATOR.lt ||
    condition.op === FORM_CONDITION_OPERATOR.lte
  ) {
    validateNumericComparison(target, condition.value, path, context.issues);
  }
}

function hasCycle(
  start: string,
  current: string,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  seen: Set<string>,
): boolean {
  for (const next of graph.get(current) ?? []) {
    if (next === start) {
      return true;
    }

    if (!seen.has(next)) {
      seen.add(next);

      if (hasCycle(start, next, graph, seen)) {
        return true;
      }
    }
  }

  return false;
}

function detectConditionCycles(fields: readonly FormCustomField[], issues: FormSchemaIssues): void {
  const graph = new Map<string, Set<string>>();

  for (const field of fields) {
    const refs = new Set<string>();

    if (field.visibleWhen !== undefined) {
      collectCustomRefs(field.visibleWhen, refs);
    }

    if (field.requiredWhen !== undefined) {
      collectCustomRefs(field.requiredWhen, refs);
    }

    refs.delete(field.key);
    graph.set(field.key, refs);
  }

  for (const [index, field] of fields.entries()) {
    if (hasCycle(field.key, field.key, graph, new Set([field.key]))) {
      issues.error(
        `customFields.${index}`,
        "condition_cycle",
        `Conditions for "${field.key}" form a cycle.`,
      );
    }
  }
}

function validateFieldCondition(
  field: FormCustomField,
  index: number,
  key: "visibleWhen" | "requiredWhen",
  context: ConditionContext,
): number {
  const condition = field[key];

  if (condition === undefined) {
    return 0;
  }

  const path = `customFields.${index}.${key}`;
  const count = countConditionNodes(condition);
  const depth = conditionDepth(condition);

  if (count > MAX_FORM_SCHEMA_CONDITIONS_PER_FIELD) {
    context.issues.error(
      path,
      "too_many_conditions",
      `A field may contain at most ${MAX_FORM_SCHEMA_CONDITIONS_PER_FIELD} condition nodes.`,
    );
  }

  if (depth > MAX_FORM_SCHEMA_CONDITION_DEPTH) {
    context.issues.error(
      path,
      "condition_too_deep",
      `Conditions may be nested at most ${MAX_FORM_SCHEMA_CONDITION_DEPTH} levels deep.`,
    );
  }

  validateCondition(condition, path, field.key, context);
  return count;
}

export function validateConditions(
  schema: FormSchema,
  options: FormSchemaValidationOptions,
  issues: FormSchemaIssues,
): void {
  const fields = schema.customFields ?? [];
  const context: ConditionContext = {
    customFields: new Map(fields.map((field) => [field.key, field])),
    groups: new Map((schema.groups ?? []).map((group) => [group.key, group])),
    activeTicketKeys: new Set(options.activeTicketTypeKeys),
    issues,
  };
  let total = 0;

  for (const [index, field] of fields.entries()) {
    for (const key of ["visibleWhen", "requiredWhen"] as const) {
      total += validateFieldCondition(field, index, key, context);
    }
  }

  if (total > MAX_FORM_SCHEMA_CONDITIONS) {
    issues.error(
      "customFields",
      "too_many_form_conditions",
      `A form may contain at most ${MAX_FORM_SCHEMA_CONDITIONS} condition nodes.`,
    );
  }

  detectConditionCycles(fields, issues);
}
