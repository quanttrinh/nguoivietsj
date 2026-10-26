// @boundary client
import { type JSX } from "preact";

import { FORM_OVERRIDE_KEY } from "~/events/domain/form-schema/constants";
import { type ResolvedFullNameField } from "~/events/domain/form-schema/resolve/resolve";
import { MAX_FULL_NAME_LENGTH } from "~/events/domain/limits";

import { type PublicRegistrationConfig } from "../../shared/registration-types";
import { TextField } from "./FieldPrimitives";

export interface FullNameFieldProps {
  field: ResolvedFullNameField;
  config: PublicRegistrationConfig;
  error?: string | undefined;
}

export function FullNameField(props: FullNameFieldProps): JSX.Element {
  return (
    <TextField
      fieldRef={props.field.ref}
      label={props.field.label ?? props.config.fields.fullNameLabel}
      required={props.field.required}
      name={FORM_OVERRIDE_KEY.fullName}
      autocomplete="name"
      placeholder={props.field.placeholder ?? props.config.fields.fullNamePlaceholder}
      help={props.field.help ?? props.config.fields.fullNameHelp}
      maxLength={MAX_FULL_NAME_LENGTH}
      error={props.error}
      fallbackError={props.config.messages.required}
    />
  );
}
