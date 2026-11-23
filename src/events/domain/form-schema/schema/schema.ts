// @boundary shared
import { scope, type } from "arktype";

import { CONTACT_KIND } from "~/events/domain/constants";
import {
  FORM_CONFIRMATION_MODE,
  FORM_CONDITION_NODE,
  FORM_CONDITION_OPERATOR,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_FIELD_WIDTH,
  FORM_GROUP_MODE,
  FORM_GROUP_RENDERER,
  FORM_OVERRIDE_KEY,
  FORM_SCHEMA_VERSION,
} from "~/events/domain/form-schema/constants";
import { LIMITS } from "~/events/domain/limits";
import { FORM_KEY_REGEX, FORM_REF_REGEX } from "~/events/domain/patterns";
import { localizedTextSchema, patternStringSchema } from "~/events/domain/schemas/common";

const formKeySchema = patternStringSchema(FORM_KEY_REGEX, 64);
const formRefSchema = patternStringSchema(FORM_REF_REGEX, 160);
const widthSchema = type.valueOf(FORM_FIELD_WIDTH);
const contactKindSchema = type.valueOf(CONTACT_KIND);

export const contactFieldSchema = type({
  "required?": type("boolean"),
  width: widthSchema,
  label: localizedTextSchema,
  "help?": localizedTextSchema,
  "placeholder?": localizedTextSchema,
});

export const confirmationSchema = type({
  mode: type.valueOf(FORM_CONFIRMATION_MODE),
  methods: contactKindSchema.array().atMostLength(3),
});

export const contactsSchema = type({
  [CONTACT_KIND.email]: contactFieldSchema,
  [CONTACT_KIND.phone]: contactFieldSchema,
  [CONTACT_KIND.mail]: contactFieldSchema,
  confirmation: confirmationSchema,
});

export const overrideSchema = type({
  "label?": localizedTextSchema,
  "help?": localizedTextSchema,
  "placeholder?": localizedTextSchema,
});

export const overridesSchema = type({
  [FORM_OVERRIDE_KEY.fullName]: overrideSchema.optional(),
  [FORM_OVERRIDE_KEY.consent]: overrideSchema.optional(),
});

export const sectionSchema = type({
  key: formKeySchema,
  order: type(`${-LIMITS.form.order} <= number.integer <= ${LIMITS.form.order}`),
  label: localizedTextSchema,
  "description?": localizedTextSchema,
});

export const fieldSchema = type({
  ref: formRefSchema,
  section: formKeySchema,
  order: type(`${-LIMITS.form.order} <= number.integer <= ${LIMITS.form.order}`),
  width: widthSchema,
});

export const groupOptionSchema = type({
  ref: formRefSchema,
  label: localizedTextSchema,
});

export const groupSchema = type({
  key: formKeySchema,
  label: localizedTextSchema,
  mode: type.valueOf(FORM_GROUP_MODE),
  members: formRefSchema.array().atLeastLength(2).atMostLength(LIMITS.form.groupMembers),
  renderer: type.valueOf(FORM_GROUP_RENDERER),
  "required?": type("boolean"),
  "default?": formRefSchema,
  width: widthSchema,
  "options?": groupOptionSchema.array().atLeastLength(2).atMostLength(LIMITS.form.groupMembers),
});

export const customOptionSchema = type({
  value: type(`1 <= string <= ${LIMITS.form.optionValue}`),
  label: localizedTextSchema,
});

const conditionScope = scope({
  equalityCondition: {
    field: "string",
    op: `'${FORM_CONDITION_OPERATOR.equals}' | '${FORM_CONDITION_OPERATOR.notEquals}'`,
    value: "string | number | boolean",
  },
  membershipCondition: {
    field: "string",
    op: `'${FORM_CONDITION_OPERATOR.in}' | '${FORM_CONDITION_OPERATOR.notIn}'`,
    value: "1 <= (string | number | boolean)[] <= 20",
  },
  existenceCondition: {
    field: "string",
    op: `'${FORM_CONDITION_OPERATOR.exists}' | '${FORM_CONDITION_OPERATOR.notExists}'`,
  },
  comparisonCondition: {
    field: "string",
    op: `'${FORM_CONDITION_OPERATOR.gt}' | '${FORM_CONDITION_OPERATOR.gte}' | '${FORM_CONDITION_OPERATOR.lt}' | '${FORM_CONDITION_OPERATOR.lte}'`,
    value: "number",
  },
  allCondition: {
    [FORM_CONDITION_NODE.all]: "1 <= condition[] <= 10",
  },
  anyCondition: {
    [FORM_CONDITION_NODE.any]: "1 <= condition[] <= 10",
  },
  notCondition: {
    [FORM_CONDITION_NODE.not]: "condition",
  },
  condition:
    "equalityCondition | membershipCondition | existenceCondition | comparisonCondition | allCondition | anyCondition | notCondition",
}).export();

export const conditionSchema = conditionScope.condition;

export const customFieldSchema = type({
  key: formKeySchema,
  type: type.valueOf(FORM_CUSTOM_FIELD_TYPE),
  "required?": type("boolean"),
  label: localizedTextSchema,
  "help?": localizedTextSchema,
  "placeholder?": localizedTextSchema,
  "minLength?": type(`0 <= number.integer <= ${LIMITS.form.customText}`),
  "maxLength?": type(`0 <= number.integer <= ${LIMITS.form.customText}`),
  "min?": type("number"),
  "max?": type("number"),
  "step?": type("number > 0"),
  "rows?": type(`1 <= number.integer <= ${LIMITS.form.textareaRows}`),
  "defaultValue?": type("unknown"),
  "options?": customOptionSchema.array().atLeastLength(1).atMostLength(LIMITS.form.options),
  "visibleWhen?": conditionSchema,
  "requiredWhen?": conditionSchema,
});

export const formSchemaSchema = type({
  version: type("number").narrow((value) => value === FORM_SCHEMA_VERSION),
  contacts: contactsSchema,
  "overrides?": overridesSchema,
  sections: sectionSchema.array().atMostLength(LIMITS.form.sections),
  fields: fieldSchema.array().atMostLength(LIMITS.form.fields),
  "groups?": groupSchema.array().atMostLength(LIMITS.form.groups),
  "customFields?": customFieldSchema.array().atMostLength(LIMITS.form.customFields),
});

export type FormSchema = typeof formSchemaSchema.infer;
export type FormContactFieldConfig = typeof contactFieldSchema.infer;
export type FormContactsConfig = typeof contactsSchema.infer;
export type FormPresentationOverride = typeof overrideSchema.infer;
export type FormOverrides = typeof overridesSchema.infer;
export type FormSection = typeof sectionSchema.infer;
export type FormFieldPlacement = typeof fieldSchema.infer;
export type FormGroupOption = typeof groupOptionSchema.infer;
export type FormGroup = typeof groupSchema.infer;
export type FormCustomOption = typeof customOptionSchema.infer;
export type FormCustomField = typeof customFieldSchema.infer;
export type FormCondition = typeof conditionSchema.infer;
