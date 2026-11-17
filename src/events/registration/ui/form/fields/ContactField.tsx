// @boundary client
import type { JSX } from "preact";

import { contactFieldName } from "~/events/domain/form-schema/constants";
import type { ResolvedContactField } from "~/events/domain/form-schema/resolve/resolve";
import { MAX_EMAIL_ADDRESS_LENGTH, MAX_PHONE_NUMBER_LENGTH } from "~/events/domain/limits";
import { EMAIL_PATTERN, PHONE_MASK } from "~/events/domain/patterns";
import { stripNulishProps } from "~/shared/client/strip-props";

import type { FieldProps } from "./field-types";
import { FieldFrame } from "./FieldPrimitives";

export type ContactFieldProps = FieldProps<ResolvedContactField>;

export function ContactField(props: ContactFieldProps): JSX.Element {
  const phone = props.field.contact === "phone";

  return (
    <FieldFrame
      fieldRef={props.field.ref}
      label={props.field.label}
      required={props.required}
      help={props.field.help}
      error={props.error}
      fallbackError={props.config.messages.required}
    >
      <qui-input
        name={contactFieldName(props.field.contact)}
        inputType={phone ? "tel" : "text"}
        inputModeHint={phone ? "tel" : "email"}
        autocomplete={phone ? "tel" : "email"}
        maxLength={phone ? MAX_PHONE_NUMBER_LENGTH : MAX_EMAIL_ADDRESS_LENGTH}
        required={props.required}
        {...stripNulishProps({
          mask: phone ? PHONE_MASK : undefined,
          inputPattern: phone ? undefined : EMAIL_PATTERN,
          placeholder: props.field.placeholder,
        })}
      />
    </FieldFrame>
  );
}
