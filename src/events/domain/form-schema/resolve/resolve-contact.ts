import { CONTACT_KIND } from "~/events/domain/constants";
/* oxlint-disable eslint/max-params -- Resolver helpers take explicit locale/schema context. */
import {
  FORM_FIELD_KIND,
  FORM_FIELD_WIDTH,
  FORM_REF,
  contactRef,
} from "~/events/domain/form-schema/constants";
import type {
  FormConfirmationMode,
  FormContactKind,
  FormContactsConfig,
  FormFieldWidth,
} from "~/events/domain/form-schema/types";
import { localized, nullableLocalized } from "~/events/domain/localized";

export interface ResolvedContactConfig {
  required: boolean;
  label: string;
  help: string | null;
  placeholder: string | null;
  width: FormFieldWidth;
}

export interface ResolvedConfirmationMethod {
  kind: FormContactKind;
  label: string;
}

export interface ResolvedConfirmation {
  mode: FormConfirmationMode;
  methods: ResolvedConfirmationMethod[];
}

export interface ResolvedContactField {
  kind: typeof FORM_FIELD_KIND.contact;
  ref: string;
  contact: typeof CONTACT_KIND.email | typeof CONTACT_KIND.phone;
  width: FormFieldWidth;
  label: string;
  help: string | null;
  placeholder: string | null;
  required: boolean;
}

export interface ResolvedMailField {
  kind: typeof FORM_FIELD_KIND.mail;
  ref: typeof FORM_REF.contactMail;
  width: typeof FORM_FIELD_WIDTH.full;
  label: string;
  help: string | null;
  placeholder: string | null;
  required: boolean;
}

export function resolveContactConfig(
  config: FormContactsConfig[typeof CONTACT_KIND.email],
  locale: string,
  fallback: string,
): ResolvedContactConfig {
  return {
    required: config.required === true,
    label: localized(config.label, locale, fallback),
    help: nullableLocalized(config.help, locale),
    placeholder: nullableLocalized(config.placeholder, locale),
    width: config.width,
  };
}

export function contactLabel(
  kind: FormContactKind,
  contacts: FormContactsConfig,
  locale: string,
): string {
  let config = contacts.mail;

  if (kind === CONTACT_KIND.email) {
    config = contacts.email;
  } else if (kind === CONTACT_KIND.phone) {
    config = contacts.phone;
  }

  return resolveContactConfig(config, locale, kind).label;
}

export function resolveContactField(
  kind: typeof CONTACT_KIND.email | typeof CONTACT_KIND.phone,
  contacts: FormContactsConfig,
  locale: string,
  width: FormFieldWidth,
): ResolvedContactField {
  const config = contacts[kind];
  const resolved = resolveContactConfig(config, locale, kind);

  return {
    kind: FORM_FIELD_KIND.contact,
    ref: contactRef(kind),
    contact: kind,
    width,
    label: resolved.label,
    help: resolved.help,
    placeholder: resolved.placeholder,
    required: resolved.required,
  };
}

export function resolveMailField(contacts: FormContactsConfig, locale: string): ResolvedMailField {
  const resolved = resolveContactConfig(contacts.mail, locale, CONTACT_KIND.mail);

  return {
    kind: FORM_FIELD_KIND.mail,
    ref: FORM_REF.contactMail,
    width: FORM_FIELD_WIDTH.full,
    label: resolved.label,
    help: resolved.help,
    placeholder: resolved.placeholder,
    required: resolved.required,
  };
}
