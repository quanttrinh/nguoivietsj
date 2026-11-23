// @boundary client
import type { JSX } from "preact";

import { FORM_REF_PREFIX } from "~/events/domain/form-schema/constants";
import type { ResolvedConsentField } from "~/events/domain/form-schema/resolve/resolve";

import type { PublicRegistrationConfig } from "../../shared/registration-types";
import { FieldFrame } from "./FieldPrimitives";

interface ConsentFieldProps {
  field: ResolvedConsentField;
  config: PublicRegistrationConfig;
  error?: string | undefined;
}

export function ConsentField({ field, config, error }: ConsentFieldProps): JSX.Element {
  return (
    <FieldFrame
      fieldRef={field.ref}
      label={null}
      required={field.required}
      help={field.help ?? config.labels.fields.consent.help}
      error={error}
      fallbackError={config.labels.errors.required}
    >
      <qui-checkbox name={FORM_REF_PREFIX.consent} required={field.required}>
        {field.label ?? config.labels.fields.consent.label}
      </qui-checkbox>
    </FieldFrame>
  );
}
