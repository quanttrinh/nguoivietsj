// @boundary client
import type { JSX } from "preact";

import { FORM_OVERRIDE_KEY } from "~/features/events/domain/form-schema/constants";
import type { ResolvedFullNameField } from "~/features/events/domain/form-schema/resolve/resolve";
import { MAX_FULL_NAME_LENGTH } from "~/features/events/domain/limits";

import type { PublicRegistrationConfig } from "../../shared/registration-types";
import { TextField } from "./FieldPrimitives";

interface FullNameFieldProps {
  field: ResolvedFullNameField;
  config: PublicRegistrationConfig;
  error?: string | undefined;
}

export function FullNameField({ field, config, error }: FullNameFieldProps): JSX.Element {
  return (
    <TextField
      fieldRef={field.ref}
      label={field.label ?? config.labels.engineRegistration.fields.fullName.label}
      required={field.required}
      name={FORM_OVERRIDE_KEY.fullName}
      autocomplete="name"
      placeholder={
        field.placeholder ?? config.labels.engineRegistration.fields.fullName.placeholder
      }
      help={field.help ?? config.labels.engineRegistration.fields.fullName.help}
      maxLength={MAX_FULL_NAME_LENGTH}
      error={error}
      fallbackError={config.labels.engineRegistration.errors.required}
    />
  );
}
