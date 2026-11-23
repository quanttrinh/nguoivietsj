// @boundary client
import type { JSX } from "preact";

import { FORM_CONFIRMATION_FIELD_NAME } from "~/events/domain/form-schema/constants";
import type { ResolvedConfirmationField } from "~/events/domain/form-schema/resolve/resolve";

import type { PublicRegistrationConfig } from "../../shared/registration-types";
import { FieldFrame } from "./FieldPrimitives";

interface ConfirmationFieldProps {
  field: ResolvedConfirmationField;
  config: PublicRegistrationConfig;
  error?: string | undefined;
}

export function ConfirmationField({ field, config, error }: ConfirmationFieldProps): JSX.Element {
  const required = field.mode === "required";
  const defaultValue = required ? (field.methods[0]?.kind ?? "") : "";

  return (
    <FieldFrame
      fieldRef={field.ref}
      label={config.labels.fields.confirmation.label}
      required={required}
      help={config.labels.fields.confirmation.help}
      error={error}
      fallbackError={config.labels.errors.confirmationRequired}
    >
      <qui-radio-group
        name={FORM_CONFIRMATION_FIELD_NAME}
        required={required}
        defaultValue={defaultValue}
      >
        {field.mode === "optional" ? (
          <qui-radio value="">{config.labels.fields.confirmation.none}</qui-radio>
        ) : null}
        {field.methods.map((method) => (
          <qui-radio key={method.kind} value={method.kind}>
            {method.label}
          </qui-radio>
        ))}
      </qui-radio-group>
    </FieldFrame>
  );
}
