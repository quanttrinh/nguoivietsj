// @boundary client
import type { JSX } from "preact";

import { FORM_CONFIRMATION_FIELD_NAME } from "~/events/domain/form-schema/constants";
import type { ResolvedConfirmationField } from "~/events/domain/form-schema/resolve/resolve";

import type { PublicRegistrationConfig } from "../../shared/registration-types";
import { FieldFrame } from "./FieldPrimitives";

export interface ConfirmationFieldProps {
  field: ResolvedConfirmationField;
  config: PublicRegistrationConfig;
  error?: string | undefined;
}

export function ConfirmationField(props: ConfirmationFieldProps): JSX.Element {
  const required = props.field.mode === "required";
  const defaultValue = required ? (props.field.methods[0]?.kind ?? "") : "";

  return (
    <FieldFrame
      fieldRef={props.field.ref}
      label={props.config.fields.confirmationLabel}
      required={required}
      help={props.config.fields.confirmationHelp}
      error={props.error}
      fallbackError={props.config.messages.confirmationRequired}
    >
      <qui-radio-group
        name={FORM_CONFIRMATION_FIELD_NAME}
        required={required}
        defaultValue={defaultValue}
      >
        {props.field.mode === "optional" ? (
          <qui-radio value="">{props.config.fields.confirmationNone}</qui-radio>
        ) : null}
        {props.field.methods.map((method) => (
          <qui-radio key={method.kind} value={method.kind}>
            {method.label}
          </qui-radio>
        ))}
      </qui-radio-group>
    </FieldFrame>
  );
}
