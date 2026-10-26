// @boundary client
import { type InputTextCase } from "@quanttrinh/qui";
import { type JSX } from "preact";

import {
  FORM_DEFAULT_MAIL_COUNTRY,
  FORM_MAIL_SUBFIELD,
  mailFieldName,
} from "~/events/domain/form-schema/constants";
import { type ResolvedMailField } from "~/events/domain/form-schema/resolve/resolve";
import {
  MAX_ADDRESS_LINE_LENGTH,
  MAX_CITY_LENGTH,
  MAX_POSTAL_CODE_LENGTH,
} from "~/events/domain/limits";
import { stripNulishProps } from "~/shared/client/strip-props";

import { styles } from "../../shared/registration-styles";
import { type PublicRegistrationConfig } from "../../shared/registration-types";
import { type FieldErrors, type FieldProps } from "./field-types";
import { FieldFrame } from "./FieldPrimitives";

export interface MailFieldProps extends Omit<FieldProps<ResolvedMailField>, "error"> {
  errors: FieldErrors;
}

interface MailSubfieldDefinition {
  name: string;
  label: string;
  autocomplete: string;
  placeholder: string;
  maxLength: number;
  required: boolean;
  textCase?: InputTextCase | undefined;
  mask?: string | undefined;
  defaultValue?: string | undefined;
}

function mailSubfields(
  config: PublicRegistrationConfig,
  required: boolean,
): MailSubfieldDefinition[] {
  const mail = config.fields.mail;

  return [
    {
      name: FORM_MAIL_SUBFIELD.addressLine1,
      label: mail.addressLine1,
      autocomplete: "address-line1",
      placeholder: mail.addressLine1Placeholder,
      maxLength: MAX_ADDRESS_LINE_LENGTH,
      required,
    },
    {
      name: FORM_MAIL_SUBFIELD.addressLine2,
      label: mail.addressLine2,
      autocomplete: "address-line2",
      placeholder: mail.addressLine2Placeholder,
      maxLength: MAX_ADDRESS_LINE_LENGTH,
      /*
       * Address line 2 is always optional; the server schema treats it as
       * optional even when the mail contact itself is required.
       */
      required: false,
    },
    {
      name: FORM_MAIL_SUBFIELD.city,
      label: mail.city,
      autocomplete: "address-level2",
      placeholder: mail.cityPlaceholder,
      maxLength: MAX_CITY_LENGTH,
      required,
    },
    {
      name: FORM_MAIL_SUBFIELD.province,
      label: mail.province,
      autocomplete: "address-level1",
      placeholder: mail.provincePlaceholder,
      maxLength: 2,
      required,
      textCase: "uppercase",
    },
    {
      name: FORM_MAIL_SUBFIELD.postalCode,
      label: mail.postalCode,
      autocomplete: "postal-code",
      placeholder: mail.postalCodePlaceholder,
      maxLength: MAX_POSTAL_CODE_LENGTH,
      required,
      textCase: "uppercase",
      mask: "A#A #A#",
    },
    {
      name: FORM_MAIL_SUBFIELD.country,
      label: mail.country,
      autocomplete: "country",
      placeholder: mail.countryPlaceholder,
      maxLength: 2,
      required,
      textCase: "uppercase",
      ...(required ? {} : { defaultValue: FORM_DEFAULT_MAIL_COUNTRY }),
    },
  ];
}

function MailSubfield(props: {
  subfield: MailSubfieldDefinition;
  error: string | undefined;
  fallbackError: string;
}): JSX.Element {
  const name = mailFieldName(props.subfield.name);

  return (
    <FieldFrame
      fieldRef={name}
      label={props.subfield.label}
      required={props.subfield.required}
      class={styles.full}
      error={props.error}
      fallbackError={props.fallbackError}
    >
      <qui-input
        name={name}
        autocomplete={props.subfield.autocomplete}
        placeholder={props.subfield.placeholder}
        maxLength={props.subfield.maxLength}
        required={props.subfield.required}
        {...stripNulishProps({
          textCase: props.subfield.textCase,
          mask: props.subfield.mask,
          defaultValue: props.subfield.defaultValue,
        })}
      />
    </FieldFrame>
  );
}

export function MailField(props: MailFieldProps): JSX.Element {
  return (
    <fieldset class={styles.group} data-mail-field>
      <legend class={styles.legend}>{props.field.label}</legend>
      {props.field.help && <p class={styles.sectionDescription}>{props.field.help}</p>}
      <div class={styles.fields}>
        {mailSubfields(props.config, props.required).map((subfield) => (
          <MailSubfield
            key={subfield.name}
            subfield={subfield}
            error={props.errors[mailFieldName(subfield.name)]}
            fallbackError={props.config.messages.required}
          />
        ))}
      </div>
      {props.errors[props.field.ref] && <p class={styles.error}>{props.errors[props.field.ref]}</p>}
    </fieldset>
  );
}
