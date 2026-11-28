// @boundary shared
export { validateFormSchema } from "~/features/events/domain/form-schema/validation/validate";
export { validateRegistrationForm } from "~/features/events/domain/form-schema/validation/validate-registration";
export {
  evaluateCondition,
  isPresent,
} from "~/features/events/domain/form-schema/conditions/evaluate";
export { resolveRegistrationForm } from "~/features/events/domain/form-schema/resolve/resolve";
export { resolvePublishedForm } from "~/features/events/domain/form-schema/resolve/resolve-published-form";
export { createStarterFormSchema } from "~/features/events/domain/form-schema/schema/starter";
export * from "~/features/events/domain/form-schema/constants";
export * from "~/features/events/domain/form-schema/refs";

export type { FormValue } from "~/features/events/domain/form-schema/conditions/evaluate";
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
} from "~/features/events/domain/form-schema/types";

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
} from "~/features/events/domain/form-schema/resolve/resolve";
