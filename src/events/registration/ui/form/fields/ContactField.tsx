// @boundary client
import type { JSX } from "preact";

import { contactFieldName } from "~/events/domain/form-schema/constants";
import type { ResolvedContactField } from "~/events/domain/form-schema/resolve/resolve";
import { MAX_EMAIL_ADDRESS_LENGTH, MAX_PHONE_NUMBER_LENGTH } from "~/events/domain/limits";
import { EMAIL_PATTERN, PHONE_MASK } from "~/events/domain/patterns";
import { stripNulishProps } from "~/shared/client/strip-props";

import type { FieldProps } from "./field-types";
import { FieldFrame } from "./FieldPrimitives";

type ContactFieldProps = FieldProps<ResolvedContactField>;

export function ContactField({ field, config, required, error }: ContactFieldProps): JSX.Element {
  const phone = field.contact === "phone";

  return (
    <FieldFrame
      fieldRef={field.ref}
      label={field.label}
      required={required}
      help={field.help}
      error={error}
      fallbackError={config.labels.engineRegistration.errors.required}
    >
      <qui-input
        name={contactFieldName(field.contact)}
        inputType={phone ? "tel" : "text"}
        inputModeHint={phone ? "tel" : "email"}
        autocomplete={phone ? "tel" : "email"}
        maxLength={phone ? MAX_PHONE_NUMBER_LENGTH : MAX_EMAIL_ADDRESS_LENGTH}
        required={required}
        {...stripNulishProps({
          mask: phone ? PHONE_MASK : undefined,
          inputPattern: phone ? undefined : EMAIL_PATTERN,
          placeholder: field.placeholder,
        })}
      />
    </FieldFrame>
  );
}
