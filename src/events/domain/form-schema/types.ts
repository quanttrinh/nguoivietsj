/** Validated event-engine form schema types. */

import type { CONTACT_KIND } from "~/events/domain/constants";
import type {
  FORM_CONFIRMATION_MODE,
  FORM_CONDITION_NODE,
  FORM_CONDITION_OPERATOR,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_FIELD_WIDTH,
  FORM_GROUP_MODE,
  FORM_GROUP_RENDERER,
  FORM_ISSUE_SEVERITY,
  FORM_VALIDATION_MODE,
  REGISTRATION_VALIDATION_CODE,
} from "~/events/domain/form-schema/constants";

export const FORM_SCHEMA_VERSION = 4;

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

export type LocalizedText = Record<string, string>;

export interface FormContactFieldConfig {
  required?: boolean;
  width: FormFieldWidth;
  label: LocalizedText;
  help?: LocalizedText;
  placeholder?: LocalizedText;
}

export interface FormContactsConfig {
  email: FormContactFieldConfig;
  phone: FormContactFieldConfig;
  mail: FormContactFieldConfig;
  confirmation: {
    mode: FormConfirmationMode;
    methods: FormContactKind[];
  };
}

export interface FormPresentationOverride {
  label?: LocalizedText;
  help?: LocalizedText;
  placeholder?: LocalizedText;
}

export interface FormOverrides {
  fullName?: FormPresentationOverride;
  consent?: FormPresentationOverride;
}

export interface FormSection {
  key: string;
  order: number;
  label: LocalizedText;
  description?: LocalizedText;
}

export interface FormFieldPlacement {
  ref: string;
  section: string;
  order: number;
  width: FormFieldWidth;
}

export interface FormGroupOption {
  ref: string;
  label: LocalizedText;
}

export interface FormGroup {
  key: string;
  label: LocalizedText;
  mode: FormGroupMode;
  members: string[];
  renderer: FormGroupRenderer;
  required?: boolean;
  default?: string;
  width: FormFieldWidth;
  options?: FormGroupOption[];
}

export interface FormCustomOption {
  value: string;
  label: LocalizedText;
}

export type FormCondition =
  | {
      field: string;
      op: FormEqualityOperator;
      value: string | number | boolean;
    }
  | {
      field: string;
      op: FormMembershipOperator;
      value: (string | number | boolean)[];
    }
  | {
      field: string;
      op: FormExistenceOperator;
    }
  | {
      field: string;
      op: FormComparisonOperator;
      value: number;
    }
  | { [FORM_CONDITION_NODE.all]: FormCondition[] }
  | { [FORM_CONDITION_NODE.any]: FormCondition[] }
  | { [FORM_CONDITION_NODE.not]: FormCondition };

export interface FormCustomField {
  key: string;
  type: FormCustomFieldType;
  required?: boolean;
  label: LocalizedText;
  help?: LocalizedText;
  placeholder?: LocalizedText;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  defaultValue?: unknown;
  options?: FormCustomOption[];
  visibleWhen?: FormCondition;
  requiredWhen?: FormCondition;
}

export interface FormSchema {
  version: typeof FORM_SCHEMA_VERSION;
  contacts: FormContactsConfig;
  overrides?: FormOverrides;
  sections: FormSection[];
  fields: FormFieldPlacement[];
  groups?: FormGroup[];
  customFields?: FormCustomField[];
}

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
