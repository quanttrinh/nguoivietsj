// @boundary client
import { type JSX } from "preact";

import { FORM_REF_PREFIX } from "~/events/domain/form-schema/constants";
import { type ResolvedConsentField } from "~/events/domain/form-schema/resolve/resolve";

import { type PublicRegistrationConfig } from "../../shared/registration-types";
import { FieldFrame } from "./FieldPrimitives";

export interface ConsentFieldProps {
  field: ResolvedConsentField;
  config: PublicRegistrationConfig;
  error?: string | undefined;
}

export function ConsentField(props: ConsentFieldProps): JSX.Element {
  return (
    <FieldFrame
      fieldRef={props.field.ref}
      label={null}
      required={props.field.required}
      help={props.field.help ?? props.config.fields.consentHelp}
      error={props.error}
      fallbackError={props.config.messages.required}
    >
      <qui-checkbox name={FORM_REF_PREFIX.consent} required={props.field.required}>
        {props.field.label ?? props.config.fields.consentLabel}
      </qui-checkbox>
    </FieldFrame>
  );
}
