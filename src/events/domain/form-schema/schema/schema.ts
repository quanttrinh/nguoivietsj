import { Type, type TSchema } from "@sinclair/typebox";

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
} from "~/events/domain/form-schema/constants";
import { FORM_SCHEMA_VERSION } from "~/events/domain/form-schema/types";
import {
  MAX_FORM_SCHEMA_CUSTOM_FIELDS,
  MAX_FORM_SCHEMA_FIELDS,
  MAX_FORM_SCHEMA_GROUPS,
  MAX_FORM_SCHEMA_GROUP_MEMBERS,
  MAX_FORM_SCHEMA_LOCALES,
  MAX_FORM_SCHEMA_OPTIONS,
  MAX_FORM_SCHEMA_SECTIONS,
  MAX_FORM_SCHEMA_TEXT_LENGTH,
} from "~/events/domain/limits";
import { SCHEMA_FORMAT } from "~/events/domain/schema-formats";
import { createLocalizedTextSchema } from "~/events/domain/schema-primitives";

const localizedTextSchema = createLocalizedTextSchema({
  minProperties: 1,
  maxProperties: MAX_FORM_SCHEMA_LOCALES,
});

function literalUnion(values: Record<string, string>): TSchema {
  return Type.Union(Object.values(values).map((value) => Type.Literal(value)));
}

const keySchema = Type.String({ format: SCHEMA_FORMAT.formKey });
const refSchema = Type.String({ format: SCHEMA_FORMAT.formRef });
const widthSchema = literalUnion(FORM_FIELD_WIDTH);
const contactKindSchema = literalUnion(CONTACT_KIND);

const contactFieldSchema = Type.Object(
  {
    required: Type.Optional(Type.Boolean()),
    width: widthSchema,
    label: localizedTextSchema,
    help: Type.Optional(localizedTextSchema),
    placeholder: Type.Optional(localizedTextSchema),
  },
  { additionalProperties: false },
);

const confirmationModeSchema = literalUnion(FORM_CONFIRMATION_MODE);

const contactsSchema = Type.Object(
  {
    [CONTACT_KIND.email]: contactFieldSchema,
    [CONTACT_KIND.phone]: contactFieldSchema,
    [CONTACT_KIND.mail]: contactFieldSchema,
    confirmation: Type.Object(
      {
        mode: confirmationModeSchema,
        methods: Type.Array(contactKindSchema, {
          maxItems: 3,
          uniqueItems: true,
        }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const overrideSchema = Type.Object(
  {
    label: Type.Optional(localizedTextSchema),
    help: Type.Optional(localizedTextSchema),
    placeholder: Type.Optional(localizedTextSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);

const overridesSchema = Type.Object(
  {
    [FORM_OVERRIDE_KEY.fullName]: Type.Optional(overrideSchema),
    [FORM_OVERRIDE_KEY.consent]: Type.Optional(overrideSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);

const sectionSchema = Type.Object(
  {
    key: keySchema,
    order: Type.Integer({ minimum: -1_000_000, maximum: 1_000_000 }),
    label: localizedTextSchema,
    description: Type.Optional(localizedTextSchema),
  },
  { additionalProperties: false },
);

const fieldSchema = Type.Object(
  {
    ref: refSchema,
    section: keySchema,
    order: Type.Integer({ minimum: -1_000_000, maximum: 1_000_000 }),
    width: widthSchema,
  },
  { additionalProperties: false },
);

const groupOptionSchema = Type.Object(
  {
    ref: refSchema,
    label: localizedTextSchema,
  },
  { additionalProperties: false },
);

const groupSchema = Type.Object(
  {
    key: keySchema,
    label: localizedTextSchema,
    mode: literalUnion(FORM_GROUP_MODE),
    members: Type.Array(refSchema, {
      minItems: 2,
      maxItems: MAX_FORM_SCHEMA_GROUP_MEMBERS,
      uniqueItems: true,
    }),
    renderer: literalUnion(FORM_GROUP_RENDERER),
    required: Type.Optional(Type.Boolean()),
    default: Type.Optional(refSchema),
    width: widthSchema,
    options: Type.Optional(
      Type.Array(groupOptionSchema, {
        minItems: 2,
        maxItems: MAX_FORM_SCHEMA_GROUP_MEMBERS,
      }),
    ),
  },
  { additionalProperties: false },
);

const customOptionSchema = Type.Object(
  {
    value: Type.String({ minLength: 1, maxLength: 100 }),
    label: localizedTextSchema,
  },
  { additionalProperties: false },
);

const conditionValueSchema = Type.Union([
  Type.String({ maxLength: MAX_FORM_SCHEMA_TEXT_LENGTH }),
  Type.Number(),
  Type.Boolean(),
]);

const equalityOperatorSchema = Type.Union([
  Type.Literal(FORM_CONDITION_OPERATOR.equals),
  Type.Literal(FORM_CONDITION_OPERATOR.notEquals),
]);
const membershipOperatorSchema = Type.Union([
  Type.Literal(FORM_CONDITION_OPERATOR.in),
  Type.Literal(FORM_CONDITION_OPERATOR.notIn),
]);
const existenceOperatorSchema = Type.Union([
  Type.Literal(FORM_CONDITION_OPERATOR.exists),
  Type.Literal(FORM_CONDITION_OPERATOR.notExists),
]);
const comparisonOperatorSchema = Type.Union([
  Type.Literal(FORM_CONDITION_OPERATOR.gt),
  Type.Literal(FORM_CONDITION_OPERATOR.gte),
  Type.Literal(FORM_CONDITION_OPERATOR.lt),
  Type.Literal(FORM_CONDITION_OPERATOR.lte),
]);

const conditionSchema: TSchema = Type.Recursive((This) =>
  Type.Union([
    Type.Object(
      {
        field: refSchema,
        op: equalityOperatorSchema,
        value: conditionValueSchema,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        field: refSchema,
        op: membershipOperatorSchema,
        value: Type.Array(conditionValueSchema, {
          minItems: 1,
          maxItems: MAX_FORM_SCHEMA_OPTIONS,
        }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        field: refSchema,
        op: existenceOperatorSchema,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        field: refSchema,
        op: comparisonOperatorSchema,
        value: Type.Number(),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        [FORM_CONDITION_NODE.all]: Type.Array(This, { minItems: 1, maxItems: 10 }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        [FORM_CONDITION_NODE.any]: Type.Array(This, { minItems: 1, maxItems: 10 }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        [FORM_CONDITION_NODE.not]: This,
      },
      { additionalProperties: false },
    ),
  ]),
);

const customFieldSchema = Type.Object(
  {
    key: keySchema,
    type: literalUnion(FORM_CUSTOM_FIELD_TYPE),
    required: Type.Optional(Type.Boolean()),
    label: localizedTextSchema,
    help: Type.Optional(localizedTextSchema),
    placeholder: Type.Optional(localizedTextSchema),
    minLength: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000 })),
    maxLength: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000 })),
    min: Type.Optional(Type.Number()),
    max: Type.Optional(Type.Number()),
    step: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
    rows: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    defaultValue: Type.Optional(Type.Unknown()),
    options: Type.Optional(
      Type.Array(customOptionSchema, {
        minItems: 1,
        maxItems: MAX_FORM_SCHEMA_OPTIONS,
      }),
    ),
    visibleWhen: Type.Optional(conditionSchema),
    requiredWhen: Type.Optional(conditionSchema),
  },
  { additionalProperties: false },
);

export const formSchemaSchema = Type.Object(
  {
    version: Type.Literal(FORM_SCHEMA_VERSION),
    contacts: contactsSchema,
    overrides: Type.Optional(overridesSchema),
    sections: Type.Array(sectionSchema, { maxItems: MAX_FORM_SCHEMA_SECTIONS }),
    fields: Type.Array(fieldSchema, { maxItems: MAX_FORM_SCHEMA_FIELDS }),
    groups: Type.Optional(Type.Array(groupSchema, { maxItems: MAX_FORM_SCHEMA_GROUPS })),
    customFields: Type.Optional(
      Type.Array(customFieldSchema, { maxItems: MAX_FORM_SCHEMA_CUSTOM_FIELDS }),
    ),
  },
  { additionalProperties: false },
);
