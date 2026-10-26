// @boundary shared
/** Form-schema types derived from the ArkType schema, plus client DTOs. */

import { type CONTACT_KIND } from "~/events/domain/constants";
import {
  type FORM_CONFIRMATION_MODE,
  type FORM_CONDITION_OPERATOR,
  type FORM_CUSTOM_FIELD_TYPE,
  type FORM_FIELD_WIDTH,
  type FORM_GROUP_MODE,
  type FORM_GROUP_RENDERER,
  type FORM_ISSUE_SEVERITY,
  type FORM_VALIDATION_MODE,
  type REGISTRATION_VALIDATION_CODE,
} from "~/events/domain/form-schema/constants";
import {
  type FormCondition as FormConditionSchema,
  type FormContactFieldConfig as FormContactFieldConfigSchema,
  type FormContactsConfig as FormContactsConfigSchema,
  type FormCustomField as FormCustomFieldSchema,
  type FormCustomOption as FormCustomOptionSchema,
  type FormFieldPlacement as FormFieldPlacementSchema,
  type FormGroup as FormGroupSchema,
  type FormGroupOption as FormGroupOptionSchema,
  type FormOverrides as FormOverridesSchema,
  type FormPresentationOverride as FormPresentationOverrideSchema,
  type FormSchema as FormSchemaSchema,
  type FormSection as FormSectionSchema,
} from "~/events/domain/form-schema/schema/schema";
import { type LocalizedText as SharedLocalizedText } from "~/events/domain/schemas/common";

export type LocalizedText = SharedLocalizedText;
export type FormFieldWidth = (typeof FORM_FIELD_WIDTH)[keyof typeof FORM_FIELD_WIDTH];
export type FormContactKind = (typeof CONTACT_KIND)[keyof typeof CONTACT_KIND];
export type FormConfirmationMode =
  (typeof FORM_CONFIRMATION_MODE)[keyof typeof FORM_CONFIRMATION_MODE];
export type FormGroupMode = (typeof FORM_GROUP_MODE)[keyof typeof FORM_GROUP_MODE];
export type FormGroupRenderer = (typeof FORM_GROUP_RENDERER)[keyof typeof FORM_GROUP_RENDERER];
export type FormCustomFieldType =
  (typeof FORM_CUSTOM_FIELD_TYPE)[keyof typeof FORM_CUSTOM_FIELD_TYPE];

export type FormEqualityOperator =
  | typeof FORM_CONDITION_OPERATOR.equals
  | typeof FORM_CONDITION_OPERATOR.notEquals;
export type FormMembershipOperator =
  | typeof FORM_CONDITION_OPERATOR.in
  | typeof FORM_CONDITION_OPERATOR.notIn;
export type FormExistenceOperator =
  | typeof FORM_CONDITION_OPERATOR.exists
  | typeof FORM_CONDITION_OPERATOR.notExists;
export type FormComparisonOperator =
  | typeof FORM_CONDITION_OPERATOR.gt
  | typeof FORM_CONDITION_OPERATOR.gte
  | typeof FORM_CONDITION_OPERATOR.lt
  | typeof FORM_CONDITION_OPERATOR.lte;

export type FormContactFieldConfig = FormContactFieldConfigSchema;
export type FormContactsConfig = FormContactsConfigSchema;
export type FormPresentationOverride = FormPresentationOverrideSchema;
export type FormOverrides = FormOverridesSchema;
export type FormSection = FormSectionSchema;
export type FormFieldPlacement = FormFieldPlacementSchema;
export type FormGroupOption = FormGroupOptionSchema;
export type FormGroup = FormGroupSchema;
export type FormCustomOption = FormCustomOptionSchema;
export type FormCondition = FormConditionSchema;
export type FormCustomField = FormCustomFieldSchema;
export type FormSchema = FormSchemaSchema;

export interface FormSchemaValidationOptions {
  mode: (typeof FORM_VALIDATION_MODE)[keyof typeof FORM_VALIDATION_MODE];
  activeTicketTypeKeys: readonly string[];
}

export type FormSchemaIssueSeverity =
  (typeof FORM_ISSUE_SEVERITY)[keyof typeof FORM_ISSUE_SEVERITY];

export interface FormSchemaIssue {
  path: string;
  code: string;
  message: string;
  severity: FormSchemaIssueSeverity;
}

export type RegistrationValidationCode =
  (typeof REGISTRATION_VALIDATION_CODE)[keyof typeof REGISTRATION_VALIDATION_CODE];

export interface RegistrationFormIssue {
  ref: string;
  code: RegistrationValidationCode;
}

export interface RegistrationFormValidationResult {
  issues: RegistrationFormIssue[];
  answers: Record<string, unknown>;
}

export interface FormSchemaValidationResult {
  errors: FormSchemaIssue[];
  warnings: FormSchemaIssue[];
  schema: FormSchema | null;
}

export interface EngineClientTicket {
  key: string;
  min: number;
  max: number | null;
  defaultQuantity: number;
  remaining: number | null;
}

export interface EngineClientGroup {
  key: string;
  mode: FormGroupMode;
  renderer: FormGroupRenderer;
  members: string[];
  required: boolean;
  default: string | null;
}

export interface EngineClientCustomField {
  key: string;
  type: FormCustomFieldType;
  required: boolean;
  options: string[];
  minLength: number | null;
  maxLength: number | null;
  min: number | null;
  max: number | null;
  step: number | null;
  defaultValue: unknown;
}

export interface EngineClientConfig {
  locale: string;
  action: string;
  formVersion: number;
  tickets: EngineClientTicket[];
  maxTicketsPerRegistration: number | null;
  maxTotalTickets: number | null;
  remainingTotal: number | null;
  contacts: {
    email: { required: boolean };
    phone: { required: boolean };
    mail: { required: boolean };
  };
  confirmation: {
    mode: FormConfirmationMode;
    methods: FormContactKind[];
  };
  groups: EngineClientGroup[];
  customFields: EngineClientCustomField[];
  conditions: Record<
    string,
    {
      visibleWhen: FormCondition | null;
      requiredWhen: FormCondition | null;
    }
  >;
}
