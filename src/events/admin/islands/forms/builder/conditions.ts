/* oxlint-disable eslint/max-params, eslint/no-use-before-define, unicorn/max-nested-calls -- Recursive condition editing shares explicit context. */

import {
  conditionChildren,
  conditionNodeType,
  countConditionNodes,
  firstConditionChild,
  firstConditionLeaf,
  type ConditionNodeType,
} from "~/events/domain/form-schema/conditions/condition-tree";
import {
  FORM_CONDITION_NODE,
  FORM_CONDITION_OPERATOR,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_REF,
} from "~/events/domain/form-schema/constants";
import { MAX_FORM_SCHEMA_CONDITIONS_PER_FIELD } from "~/events/domain/limits";
import { defaultValueText } from "~/events/domain/presentation";

import { button, element, numberInput, selectInput, textInput } from "./dom";
import { asArray, asRecord, stringValue } from "./schema";
import { builderStyles } from "./styles";
import type { FormBuilderMessages, JsonRecord } from "./types";

export interface ConditionEditorInput {
  schema: JsonRecord;
  messages: FormBuilderMessages;
  write: (schema: JsonRecord) => void;
}

type ValueKind = "number" | "boolean" | "select" | "text";

interface Option {
  value: string;
  label: string;
}

function convertNode(
  condition: JsonRecord,
  nextType: ConditionNodeType,
  fallback: JsonRecord,
): JsonRecord {
  if (nextType === "field") {
    return firstConditionLeaf(condition) ?? fallback;
  }

  if (nextType === FORM_CONDITION_NODE.not) {
    return { [FORM_CONDITION_NODE.not]: firstConditionChild(condition) ?? fallback };
  }

  const children = conditionChildren(condition, conditionNodeType(condition));

  return {
    [nextType]: children.length === 0 ? [fallback] : children,
  };
}

function conditionRefs(schema: JsonRecord, currentKey: string): string[] {
  const refs = [
    ...asArray(schema.customFields)
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => item !== null)
      .filter((field) => stringValue(field.key) !== currentKey)
      .map((field) => `custom.${stringValue(field.key)}`),
    ...asArray(schema.groups)
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => item !== null)
      .map((group) => `group.${stringValue(group.key)}`),
    FORM_REF.fullName,
    FORM_REF.consent,
    FORM_REF.contactEmail,
    FORM_REF.contactPhone,
    FORM_REF.contactMail,
  ];

  return [...new Set(refs.filter((ref) => ref.length > 0 && !ref.endsWith(".")))];
}

function targetField(schema: JsonRecord, ref: string): JsonRecord | null {
  if (!ref.startsWith("custom.")) {
    return null;
  }

  const key = ref.slice("custom.".length);

  return (
    asArray(schema.customFields)
      .map((item) => asRecord(item))
      .find((field) => field !== null && stringValue(field.key) === key) ?? null
  );
}

function targetOptions(schema: JsonRecord, ref: string): string[] {
  if (ref.startsWith("group.")) {
    const key = ref.slice("group.".length);
    const group = asArray(schema.groups)
      .map((item) => asRecord(item))
      .find((item) => item !== null && stringValue(item.key) === key);

    return asArray(group?.members)
      .map((member) => stringValue(member))
      .filter((member) => member.length > 0);
  }

  const field = targetField(schema, ref);

  return asArray(field?.options)
    .map((option) => asRecord(option))
    .filter((option): option is JsonRecord => option !== null)
    .map((option) => stringValue(option.value))
    .filter((option) => option.length > 0);
}

function valueKind(schema: JsonRecord, ref: string): ValueKind {
  if (ref === FORM_REF.consent) {
    return "boolean";
  }

  if (ref.startsWith("system.tickets.")) {
    return "number";
  }

  if (ref.startsWith("group.")) {
    return "select";
  }

  const field = targetField(schema, ref);

  if (field === null) {
    return "text";
  }

  if (stringValue(field.type) === FORM_CUSTOM_FIELD_TYPE.number) {
    return "number";
  }

  if (stringValue(field.type) === FORM_CUSTOM_FIELD_TYPE.checkbox) {
    return "boolean";
  }

  if (
    stringValue(field.type) === FORM_CUSTOM_FIELD_TYPE.select ||
    stringValue(field.type) === FORM_CUSTOM_FIELD_TYPE.radio
  ) {
    return "select";
  }

  return "text";
}

function operatorsFor(kind: ValueKind, ref = ""): string[] {
  if (ref === FORM_REF.contactMail) {
    return [FORM_CONDITION_OPERATOR.exists, FORM_CONDITION_OPERATOR.notExists];
  }

  if (kind === "boolean") {
    return [
      FORM_CONDITION_OPERATOR.equals,
      FORM_CONDITION_OPERATOR.notEquals,
      FORM_CONDITION_OPERATOR.exists,
      FORM_CONDITION_OPERATOR.notExists,
    ];
  }

  if (kind === "number") {
    return [
      FORM_CONDITION_OPERATOR.equals,
      FORM_CONDITION_OPERATOR.notEquals,
      FORM_CONDITION_OPERATOR.gt,
      FORM_CONDITION_OPERATOR.gte,
      FORM_CONDITION_OPERATOR.lt,
      FORM_CONDITION_OPERATOR.lte,
      FORM_CONDITION_OPERATOR.in,
      FORM_CONDITION_OPERATOR.notIn,
      FORM_CONDITION_OPERATOR.exists,
      FORM_CONDITION_OPERATOR.notExists,
    ];
  }

  return [
    FORM_CONDITION_OPERATOR.equals,
    FORM_CONDITION_OPERATOR.notEquals,
    FORM_CONDITION_OPERATOR.in,
    FORM_CONDITION_OPERATOR.notIn,
    FORM_CONDITION_OPERATOR.exists,
    FORM_CONDITION_OPERATOR.notExists,
  ];
}

function defaultValue(kind: ValueKind, options: readonly string[]): string | number | boolean {
  if (kind === "number") {
    return 0;
  }

  if (kind === "boolean") {
    return false;
  }

  return options[0] ?? "";
}

function parseScalar(kind: ValueKind, raw: string): string | number | boolean {
  if (kind === "number") {
    const value = Number(raw.trim());
    return Number.isFinite(value) ? value : 0;
  }

  if (kind === "boolean") {
    return raw === "true";
  }

  return raw;
}

function parseMembership(kind: ValueKind, raw: string): (string | number | boolean)[] {
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => parseScalar(kind, value));

  return values.length === 0 ? [defaultValue(kind, [])] : values;
}

function normalizeValue(
  condition: JsonRecord,
  kind: ValueKind,
  operator: string,
  options: readonly string[],
): void {
  if (
    operator === FORM_CONDITION_OPERATOR.exists ||
    operator === FORM_CONDITION_OPERATOR.notExists
  ) {
    delete condition.value;
    return;
  }

  if (operator === FORM_CONDITION_OPERATOR.in || operator === FORM_CONDITION_OPERATOR.notIn) {
    condition.value =
      Array.isArray(condition.value) && condition.value.length > 0
        ? condition.value
        : [defaultValue(kind, options)];
    return;
  }

  if (Array.isArray(condition.value) || condition.value === undefined) {
    condition.value = defaultValue(kind, options);
  }
}

function renderValueControl(
  input: ConditionEditorInput,
  condition: JsonRecord,
  ref: string,
  operator: string,
): HTMLElement | null {
  if (
    operator === FORM_CONDITION_OPERATOR.exists ||
    operator === FORM_CONDITION_OPERATOR.notExists
  ) {
    return null;
  }

  const { schema, messages, write } = input;
  const kind = valueKind(schema, ref);
  const options = targetOptions(schema, ref);
  const rawValue = Array.isArray(condition.value)
    ? condition.value.join(", ")
    : defaultValueText(condition.value);

  if (operator === FORM_CONDITION_OPERATOR.in || operator === FORM_CONDITION_OPERATOR.notIn) {
    return textInput(
      rawValue,
      (next) => {
        condition.value = parseMembership(kind, next);
        write(schema);
      },
      messages.conditionValue,
    );
  }

  if (kind === "boolean") {
    const current = defaultValueText(condition.value ?? false);
    return selectInput(
      current,
      [
        { value: "true", label: "true" },
        { value: "false", label: "false" },
      ],
      (next) => {
        condition.value = next === "true";
        write(schema);
      },
      messages.conditionValue,
    );
  }

  if (kind === "select" && options.length > 0) {
    const current = defaultValueText(condition.value ?? options[0]);
    return selectInput(
      current,
      options.map((value) => ({ value, label: value })),
      (next) => {
        condition.value = next;
        write(schema);
      },
      messages.conditionValue,
    );
  }

  if (kind === "number") {
    return numberInput(
      typeof condition.value === "number" ? condition.value : undefined,
      (next) => {
        const value = Number(next);
        condition.value = Number.isFinite(value) ? value : 0;
        write(schema);
      },
      messages.conditionValue,
    );
  }

  return textInput(
    rawValue,
    (next) => {
      condition.value = next;
      write(schema);
    },
    messages.conditionValue,
  );
}

function renderLeaf(
  input: ConditionEditorInput,
  condition: JsonRecord,
  fieldKey: string,
): HTMLElement {
  const { schema, messages, write } = input;
  const row = element("div");
  row.className = builderStyles.row;
  const directRefs = conditionRefs(schema, fieldKey);
  const currentRef = stringValue(condition.field) || (directRefs[0] ?? "");
  const refs = directRefs.includes(currentRef) ? directRefs : [currentRef, ...directRefs];
  const operators = operatorsFor(valueKind(schema, currentRef), currentRef);
  const currentOperator = operators.includes(stringValue(condition.op))
    ? stringValue(condition.op)
    : FORM_CONDITION_OPERATOR.exists;

  row.append(
    selectInput(
      currentRef,
      refs.map((value) => ({ value, label: value })),
      (next) => {
        condition.field = next;
        const nextOperators = operatorsFor(valueKind(schema, next), next);
        const nextOperator = operators.includes(stringValue(condition.op))
          ? stringValue(condition.op)
          : FORM_CONDITION_OPERATOR.exists;
        condition.op = nextOperators.includes(nextOperator)
          ? nextOperator
          : FORM_CONDITION_OPERATOR.exists;
        normalizeValue(
          condition,
          valueKind(schema, next),
          stringValue(condition.op),
          targetOptions(schema, next),
        );
        write(schema);
      },
      messages.conditionField,
    ),
    selectInput(
      currentOperator,
      operators.map((value) => ({ value, label: value })),
      (next) => {
        condition.op = next;
        normalizeValue(
          condition,
          valueKind(schema, currentRef),
          next,
          targetOptions(schema, currentRef),
        );
        write(schema);
      },
      messages.conditionOperator,
    ),
  );

  const valueControl = renderValueControl(input, condition, currentRef, currentOperator);

  if (valueControl !== null) {
    row.append(valueControl);
  }

  return row;
}

function renderGroup(
  input: ConditionEditorInput,
  condition: JsonRecord,
  field: JsonRecord,
  type: Exclude<ConditionNodeType, "field">,
  level: number,
  remaining: number,
  replace: (next: JsonRecord) => void,
): HTMLElement {
  const { schema, messages, write } = input;
  const body = element("div");
  body.className = builderStyles.conditionChildren;
  const fallback = (): JsonRecord => defaultLeaf(schema, stringValue(field.key));

  if (type === FORM_CONDITION_NODE.not) {
    const existingChild = asRecord(condition[type]);
    const child = existingChild ?? fallback();

    if (existingChild === null) {
      condition[type] = child;
    }

    body.append(
      renderConditionNode(input, child, field, level + 1, remaining, (next) => {
        condition[type] = next;
        write(schema);
      }),
    );
    return body;
  }

  const children = asArray(condition[type]);

  for (const [index, rawChild] of children.entries()) {
    const existingChild = asRecord(rawChild);
    const child = existingChild ?? fallback();

    if (existingChild === null) {
      children[index] = child;
    }

    body.append(
      renderConditionNode(
        input,
        child,
        field,
        level + 1,
        remaining,
        (next) => {
          children[index] = next;
          write(schema);
        },
        () => {
          if (children.length <= 1) {
            replace(fallback());
            return;
          }

          children.splice(index, 1);
          write(schema);
        },
      ),
    );
  }

  const actions = element("div");
  actions.className = builderStyles.row;
  const addCondition = button(messages.addCondition, () => {
    children.push(fallback());
    write(schema);
  });
  addCondition.disabled = remaining < 1;
  actions.append(addCondition);

  if (level < 2) {
    const addGroup = button(messages.addConditionGroup, () => {
      children.push({ [FORM_CONDITION_NODE.all]: [fallback()] });
      write(schema);
    });
    addGroup.disabled = remaining < 2;
    actions.append(addGroup);
  }

  body.append(actions);
  return body;
}

function renderConditionNode(
  input: ConditionEditorInput,
  condition: JsonRecord,
  field: JsonRecord,
  level: number,
  remaining: number,
  replace: (next: JsonRecord) => void,
  onRemove?: () => void,
): HTMLElement {
  const { schema, messages } = input;
  const card = element("div");
  card.className = builderStyles.conditionCard;
  const type = conditionNodeType(condition);
  const header = element("div");
  header.className = builderStyles.row;
  const canUseGroups = level < 3 && (type !== "field" || remaining >= 1);
  const typeOptions: Option[] = [
    { value: "field", label: messages.conditionNodeField },
    ...(canUseGroups
      ? [
          { value: FORM_CONDITION_NODE.all, label: messages.conditionGroupAll },
          { value: FORM_CONDITION_NODE.any, label: messages.conditionGroupAny },
          { value: FORM_CONDITION_NODE.not, label: messages.conditionGroupNot },
        ]
      : []),
  ];

  header.append(
    selectInput(
      type,
      typeOptions,
      (next) => {
        replace(
          convertNode(
            condition,
            next as ConditionNodeType,
            defaultLeaf(schema, stringValue(field.key)),
          ),
        );
      },
      messages.conditionType,
    ),
  );

  if (onRemove !== undefined) {
    header.append(button(messages.removeNode, onRemove));
  }

  card.append(header);

  if (type === "field") {
    card.append(renderLeaf(input, condition, stringValue(field.key)));
  } else {
    card.append(renderGroup(input, condition, field, type, level, remaining, replace));
  }

  return card;
}

function defaultLeaf(schema: JsonRecord, currentKey: string): JsonRecord {
  const ref = conditionRefs(schema, currentKey)[0] ?? FORM_REF.consent;

  return { field: ref, op: FORM_CONDITION_OPERATOR.exists };
}

/** Render a recursive all/any/not condition editor. */
export function renderConditionEditor(
  input: ConditionEditorInput,
  field: JsonRecord,
  key: "visibleWhen" | "requiredWhen",
  addLabel: string,
): HTMLElement {
  const { schema, messages, write } = input;
  const wrapper = element("div");
  wrapper.className = builderStyles.conditionEditor;
  const condition = asRecord(field[key]);

  if (condition === null) {
    wrapper.append(
      button(addLabel, () => {
        field[key] = defaultLeaf(schema, stringValue(field.key));
        write(schema);
      }),
    );
    return wrapper;
  }

  const replace = (next: JsonRecord): void => {
    field[key] = next;
    write(schema);
  };
  const remaining = MAX_FORM_SCHEMA_CONDITIONS_PER_FIELD - countConditionNodes(condition);

  wrapper.append(
    renderConditionNode(input, condition, field, 1, remaining, replace, () => {
      Reflect.deleteProperty(field, key);
      write(schema);
    }),
  );

  if (remaining <= 0) {
    const limit = element("p", messages.conditionNodeLimit);
    limit.className = builderStyles.help;
    wrapper.append(limit);
  }

  return wrapper;
}
