/* oxlint-disable eslint/no-nested-ternary, unicorn/no-nested-ternary, eslint/no-negated-condition, unicorn/no-negated-condition, typescript/consistent-type-imports -- Direct rendering keeps related state branches together; FORM_FIELD_KIND is used in type queries. */
import type { JSX } from "preact";

import {
  FORM_DEFAULT_MAIL_COUNTRY,
  FORM_FIELD_KIND,
  FORM_MAIL_SUBFIELD,
  contactFieldName,
  mailFieldName,
} from "~/events/domain/form-schema/constants";
import type { ResolvedField } from "~/events/domain/form-schema/resolve/resolve";
import {
  MAX_ADDRESS_LINE_LENGTH,
  MAX_CITY_LENGTH,
  MAX_EMAIL_ADDRESS_LENGTH,
  MAX_PHONE_NUMBER_LENGTH,
  MAX_POSTAL_CODE_LENGTH,
} from "~/shared/constants/limits";
import { PHONE_MASK_PATTERN } from "~/shared/constants/patterns";

import { styles } from "../registration-styles";
import type { PublicRegistrationConfig } from "../registration-types";
import { ErrorText, Label, domId } from "./field-primitives";

export function ContactField(props: {
  field: Extract<
    ResolvedField,
    {
      kind: typeof FORM_FIELD_KIND.contact;
    }
  >;
  config: PublicRegistrationConfig;
}): JSX.Element {
  const contact = (): string => props.field.contact;
  return (
    <qui-field
      id={domId(props.field.ref)}
      data-field-ref={props.field.ref}
      required={props.field.required || undefined}
    >
      <Label label={props.field.label} required={props.field.required} />
      <qui-input
        name={contactFieldName(contact())}
        input-type={contact() === "email" ? "email" : "tel"}
        input-mode-hint={contact() === "email" ? "email" : "tel"}
        autocomplete={contact() === "email" ? "email" : "tel"}
        mask-pattern={contact() === "phone" ? PHONE_MASK_PATTERN : undefined}
        placeholder={props.field.placeholder ?? ""}
        max-length={contact() === "email" ? MAX_EMAIL_ADDRESS_LENGTH : MAX_PHONE_NUMBER_LENGTH}
        required={props.field.required || undefined}
      />
      {props.field.help !== null ? (
        <qui-field-helper-text>{props.field.help}</qui-field-helper-text>
      ) : null}
      <ErrorText message={props.config.messages.required} />
    </qui-field>
  );
}
export function MailField(props: {
  field: Extract<
    ResolvedField,
    {
      kind: typeof FORM_FIELD_KIND.mail;
    }
  >;
  config: PublicRegistrationConfig;
}): JSX.Element {
  const required = (): boolean => props.field.required;
  const item = (input: {
    name: string;
    label: string;
    autocomplete: string;
    placeholder: string;
    maxLength: string;
    extra?: Record<string, string | undefined>;
  }): JSX.Element => (
    <qui-field
      id={domId(mailFieldName(input.name))}
      data-field-ref={mailFieldName(input.name)}
      class={styles.full}
      required={required() || undefined}
    >
      <Label label={input.label} required={required()} />
      <qui-input
        name={mailFieldName(input.name)}
        autocomplete={input.autocomplete}
        placeholder={input.placeholder}
        max-length={input.maxLength}
        text-case={input.extra?.["text-case"]}
        mask-pattern={input.extra?.["mask-pattern"]}
        default-value={input.extra?.["default-value"]}
        required={required() || undefined}
      />
      <ErrorText message={props.config.messages.required} />
    </qui-field>
  );
  return (
    <fieldset class={styles.group} data-mail-field>
      <legend class={styles.legend}>{props.field.label}</legend>
      {props.field.help !== null ? (
        <p class={styles.sectionDescription}>{props.field.help}</p>
      ) : null}
      <div class={styles.fields}>
        {item({
          name: FORM_MAIL_SUBFIELD.addressLine1,
          label: props.config.fields.mail.addressLine1,
          autocomplete: "address-line1",
          placeholder: props.config.fields.mail.addressLine1Placeholder,
          maxLength: String(MAX_ADDRESS_LINE_LENGTH),
        })}
        {item({
          name: FORM_MAIL_SUBFIELD.addressLine2,
          label: props.config.fields.mail.addressLine2,
          autocomplete: "address-line2",
          placeholder: props.config.fields.mail.addressLine2Placeholder,
          maxLength: String(MAX_ADDRESS_LINE_LENGTH),
        })}
        {item({
          name: FORM_MAIL_SUBFIELD.city,
          label: props.config.fields.mail.city,
          autocomplete: "address-level2",
          placeholder: props.config.fields.mail.cityPlaceholder,
          maxLength: String(MAX_CITY_LENGTH),
        })}
        {item({
          name: FORM_MAIL_SUBFIELD.province,
          label: props.config.fields.mail.province,
          autocomplete: "address-level1",
          placeholder: props.config.fields.mail.provincePlaceholder,
          maxLength: "2",
          extra: {
            "text-case": "uppercase",
          },
        })}
        {item({
          name: FORM_MAIL_SUBFIELD.postalCode,
          label: props.config.fields.mail.postalCode,
          autocomplete: "postal-code",
          placeholder: props.config.fields.mail.postalCodePlaceholder,
          maxLength: String(MAX_POSTAL_CODE_LENGTH),
          extra: {
            "text-case": "uppercase",
            "mask-pattern": "a#a #a#",
          },
        })}
        {item({
          name: FORM_MAIL_SUBFIELD.country,
          label: props.config.fields.mail.country,
          autocomplete: "country",
          placeholder: props.config.fields.mail.countryPlaceholder,
          maxLength: "2",
          extra: {
            "text-case": "uppercase",
            "default-value": required() ? undefined : FORM_DEFAULT_MAIL_COUNTRY,
          },
        })}
      </div>
    </fieldset>
  );
}
