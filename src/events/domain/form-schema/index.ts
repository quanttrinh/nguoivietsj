export { validateFormSchema } from "~/events/domain/form-schema/validation/validate";
export { validateRegistrationForm } from "~/events/domain/form-schema/validation/validate-registration";
export { evaluateCondition, isPresent } from "~/events/domain/form-schema/conditions/evaluate";
export { resolveRegistrationForm } from "~/events/domain/form-schema/resolve/resolve";
export { createStarterFormSchema } from "~/events/domain/form-schema/schema/starter";
export { FORM_SCHEMA_VERSION } from "~/events/domain/form-schema/types";
export * from "~/events/domain/form-schema/constants";

export type { FormValue } from "~/events/domain/form-schema/conditions/evaluate";
export type {
  EngineClientConfig,
  EngineClientCustomField,
  EngineClientGroup,
  EngineClientTicket,
  FormCondition,
  FormConfirmationMode,
  FormContactKind,
  FormComparisonOperator,
  FormContactsConfig,
  FormCustomField,
  FormCustomFieldType,
  FormCustomOption,
  FormEqualityOperator,
  FormExistenceOperator,
  FormFieldPlacement,
  FormFieldWidth,
  FormGroup,
  FormGroupMode,
  FormGroupOption,
  FormGroupRenderer,
  FormMembershipOperator,
  FormOverrides,
  FormPresentationOverride,
  RegistrationFormIssue,
  RegistrationFormValidationResult,
  RegistrationValidationCode,
  FormSchema,
  FormSchemaIssue,
  FormSchemaIssueSeverity,
  FormSchemaValidationOptions,
  FormSchemaValidationResult,
  FormSection,
  LocalizedText,
} from "~/events/domain/form-schema/types";

export type {
  ResolvedConfirmation,
  ResolvedConfirmationField,
  ResolvedConfirmationMethod,
  ResolvedConsentField,
  ResolvedContactConfig,
  ResolvedContactField,
  ResolvedCustomField,
  ResolvedCustomOption,
  ResolvedEvent,
  ResolvedField,
  ResolvedFullNameField,
  ResolvedGroup,
  ResolvedGroupField,
  ResolvedGroupMember,
  ResolvedGroupOption,
  ResolvedMailField,
  ResolvedRegistrationForm,
  ResolvedSection,
  ResolvedTicketField,
  ResolvedTicketType,
} from "~/events/domain/form-schema/resolve/resolve";
