// @boundary client
import { CONTACT_KIND } from "~/features/events/domain/constants";
import {
  FORM_CONFIRMATION_FIELD_NAME,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_DEFAULT_MAIL_COUNTRY,
  FORM_GROUP_MODE,
  FORM_GROUP_RENDERER,
  FORM_MAIL_SUBFIELD,
  FORM_OVERRIDE_KEY,
  FORM_REF,
  FORM_REF_PREFIX,
} from "~/features/events/domain/form-schema/constants";
import {
  contactFieldName,
  contactKindFromConditionRef,
  contactRef,
  customRef,
  groupRef,
  isContactConditionRef,
  isContactRef,
  isCustomRef,
  isGroupConditionRef,
  isGroupRef,
  isTicketConditionRef,
  mailFieldName,
  refKey,
  ticketFieldName,
} from "~/features/events/domain/form-schema/refs";
import {
  computeConditionalState,
  type FormStateVisibility,
} from "~/features/events/domain/form-schema/state";
import type { EngineClientConfig } from "~/features/events/domain/form-schema/types";
import { REGISTRATION_SOURCE } from "~/features/events/domain/registration";
import { focusControl, readFormChecked, readFormValue } from "~/platform/client/form-controls";

/** Snapshots of the current form values, keyed by their form field name. */
export interface RegistrationValues {
  get: (name: string) => string;
  checked: (name: string) => boolean;
}

export type RegistrationContactPayload =
  | { kind: typeof CONTACT_KIND.email; email: string; isConfirmation: boolean }
  | { kind: typeof CONTACT_KIND.phone; phone: string; isConfirmation: boolean }
  | {
      kind: typeof CONTACT_KIND.mail;
      addressLine1: string;
      addressLine2: string | null;
      city: string;
      province: string;
      postalCode: string;
      country: string;
      isConfirmation: boolean;
    };

export interface RegistrationPayload {
  fullName: string;
  contacts: RegistrationContactPayload[];
  tickets: { key: string; quantity: number }[];
  consent: true;
  formVersion: number;
  turnstileToken: string;
  answers: Record<string, unknown>;
  metadata: { locale: string; source: string };
}

/**
 * Read the form once and expose its current values, including
 * form-associated custom elements.
 */
export function readRegistrationValues(form: HTMLFormElement): RegistrationValues {
  return {
    get(name: string): string {
      return readFormValue(form, name).trim();
    },
    checked(name: string): boolean {
      return readFormChecked(form, name);
    },
  };
}

export function customFieldConfig(
  config: EngineClientConfig,
  key: string,
): EngineClientConfig["customFields"][number] | undefined {
  return config.customFields.find((field) => field.key === key);
}

export function groupConfig(
  config: EngineClientConfig,
  key: string,
): EngineClientConfig["groups"][number] | undefined {
  return config.groups.find((group) => group.key === key);
}

export function readGroupValue(values: RegistrationValues, key: string): string {
  return values.get(groupRef(key));
}

export function mailHasValue(values: RegistrationValues): boolean {
  return [
    mailFieldName(FORM_MAIL_SUBFIELD.addressLine1),
    mailFieldName(FORM_MAIL_SUBFIELD.addressLine2),
    mailFieldName(FORM_MAIL_SUBFIELD.city),
    mailFieldName(FORM_MAIL_SUBFIELD.province),
    mailFieldName(FORM_MAIL_SUBFIELD.postalCode),
  ].some((name) => values.get(name).length > 0);
}

function readCustomValue(
  values: RegistrationValues,
  config: EngineClientConfig,
  key: string,
): string | number | boolean | null {
  const field = customFieldConfig(config, key);

  if (field === undefined) {
    return null;
  }

  const name = customRef(key);

  if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
    return values.checked(name);
  }

  const raw = values.get(name);

  if (raw.length === 0) {
    return null;
  }

  return field.type === FORM_CUSTOM_FIELD_TYPE.number ? Number(raw) : raw;
}

export function groupMemberVisible(
  ref: string,
  values: RegistrationValues,
  config: EngineClientConfig,
): boolean {
  const group = config.groups.find((candidate) => candidate.members.includes(ref));

  if (group === undefined) {
    return true;
  }

  /*
   * Only oneOf groups rendered as radio/tabs hide non-selected members. Form
   * schema validation rejects other renderers for oneOf groups, and the server
   * registration validator applies this same mode + renderer check.
   */
  if (
    group.mode === FORM_GROUP_MODE.oneOf &&
    (group.renderer === FORM_GROUP_RENDERER.radio || group.renderer === FORM_GROUP_RENDERER.tabs)
  ) {
    return readGroupValue(values, group.key) === ref;
  }

  return true;
}

export interface RegistrationFieldContext {
  values: RegistrationValues;
  config: EngineClientConfig;
  state: FormStateVisibility;
}

function readConditionValue(
  ref: string,
  context: RegistrationFieldContext,
): string | number | boolean | null {
  const { config, state, values } = context;

  if (isCustomRef(ref)) {
    if (state.visible.get(ref) === false) {
      return null;
    }

    return readCustomValue(values, config, refKey(ref, FORM_REF_PREFIX.custom) ?? "");
  }

  if (isContactConditionRef(ref)) {
    const kind = contactKindFromConditionRef(ref) ?? "";
    const systemRef = contactRef(kind);

    if (!groupMemberVisible(systemRef, values, config)) {
      return null;
    }

    if (kind === CONTACT_KIND.mail) {
      return mailHasValue(values);
    }

    return values.get(ref);
  }

  if (isGroupConditionRef(ref)) {
    return readGroupValue(values, refKey(ref, FORM_REF_PREFIX.group) ?? "");
  }

  if (isTicketConditionRef(ref)) {
    const key = refKey(ref, FORM_REF_PREFIX.ticket) ?? "";
    const raw = values.get(ticketFieldName(key));
    return raw.length === 0 ? 0 : Number(raw);
  }

  if (ref === FORM_REF_PREFIX.consent) {
    return values.checked(FORM_REF_PREFIX.consent);
  }

  return null;
}

export function computeState(
  values: RegistrationValues,
  config: EngineClientConfig,
): FormStateVisibility {
  return computeConditionalState({
    fields: config.customFields.map((field) => ({
      key: field.key,
      required: field.required,
    })),
    conditions: config.conditions,
    groupMemberVisible: (ref) => groupMemberVisible(ref, values, config),
    readConditionValue: (ref, state) => readConditionValue(ref, { values, config, state }),
  });
}

export function fieldVisible(ref: string, context: RegistrationFieldContext): boolean {
  if (isCustomRef(ref)) {
    return context.state.visible.get(ref) ?? true;
  }

  if (isContactRef(ref)) {
    return groupMemberVisible(ref, context.values, context.config);
  }

  return true;
}

export function contactRequired(ref: string, config: EngineClientConfig): boolean {
  if (ref === FORM_REF.contactEmail) {
    return config.contacts.email.required;
  }

  if (ref === FORM_REF.contactPhone) {
    return config.contacts.phone.required;
  }

  return config.contacts.mail.required;
}

export function fieldRequired(ref: string, context: RegistrationFieldContext): boolean {
  if (isCustomRef(ref)) {
    return context.state.required.get(ref) ?? false;
  }

  if (isContactRef(ref)) {
    return fieldVisible(ref, context) && contactRequired(ref, context.config);
  }

  if (isGroupRef(ref)) {
    const group = groupConfig(context.config, refKey(ref, FORM_REF_PREFIX.group) ?? "");
    return group?.required ?? false;
  }

  return false;
}

export function buildPayload(
  values: RegistrationValues,
  config: EngineClientConfig,
  state: FormStateVisibility,
): RegistrationPayload {
  const confirmation = values.get(FORM_CONFIRMATION_FIELD_NAME);
  const contacts: RegistrationContactPayload[] = [];
  const email = values.get(contactFieldName(CONTACT_KIND.email));
  const phone = values.get(contactFieldName(CONTACT_KIND.phone));

  if (groupMemberVisible(FORM_REF.contactEmail, values, config) && email.length > 0) {
    contacts.push({
      kind: CONTACT_KIND.email,
      email,
      isConfirmation: confirmation === CONTACT_KIND.email,
    });
  }

  if (groupMemberVisible(FORM_REF.contactPhone, values, config) && phone.length > 0) {
    contacts.push({
      kind: CONTACT_KIND.phone,
      phone,
      isConfirmation: confirmation === CONTACT_KIND.phone,
    });
  }

  if (groupMemberVisible(FORM_REF.contactMail, values, config) && mailHasValue(values)) {
    contacts.push({
      kind: CONTACT_KIND.mail,
      addressLine1: values.get(mailFieldName(FORM_MAIL_SUBFIELD.addressLine1)),
      addressLine2: values.get(mailFieldName(FORM_MAIL_SUBFIELD.addressLine2)) || null,
      city: values.get(mailFieldName(FORM_MAIL_SUBFIELD.city)),
      province: values.get(mailFieldName(FORM_MAIL_SUBFIELD.province)),
      postalCode: values.get(mailFieldName(FORM_MAIL_SUBFIELD.postalCode)).toUpperCase(),
      country:
        values.get(mailFieldName(FORM_MAIL_SUBFIELD.country)).toUpperCase() ||
        FORM_DEFAULT_MAIL_COUNTRY,
      isConfirmation: confirmation === CONTACT_KIND.mail,
    });
  }

  const answers: Record<string, unknown> = {};

  for (const field of config.customFields) {
    const ref = customRef(field.key);

    if (state.visible.get(ref) !== false) {
      if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
        if (values.checked(ref)) {
          answers[field.key] = true;
        }
      } else {
        const raw = values.get(ref);

        if (raw.length > 0) {
          answers[field.key] = field.type === FORM_CUSTOM_FIELD_TYPE.number ? Number(raw) : raw;
        }
      }
    }
  }

  return {
    fullName: values.get(FORM_OVERRIDE_KEY.fullName),
    contacts,
    tickets: config.tickets.map((ticket) => ({
      key: ticket.key,
      quantity: Number(values.get(ticketFieldName(ticket.key)) || "0"),
    })),
    consent: true,
    formVersion: config.formVersion,
    turnstileToken: values.get("turnstileToken"),
    answers,
    metadata: {
      locale: config.locale,
      source: REGISTRATION_SOURCE,
    },
  };
}

/** Focus a server-reported field or group issue without keeping element refs. */
export function focusRegistrationField(form: HTMLFormElement, ref: string): void {
  if (isGroupRef(ref)) {
    const wrapper = form.querySelector<HTMLElement>(
      `[data-group-key="${refKey(ref, FORM_REF_PREFIX.group) ?? ""}"]`,
    );

    focusControl(wrapper?.querySelector<HTMLElement>("qui-radio-group") ?? null);
    return;
  }

  const field = form.querySelector<HTMLElement>(`[data-field-ref="${ref}"]`);
  const control =
    field?.querySelector<HTMLElement>(
      "qui-input, qui-textarea, qui-select, qui-radio-group, qui-checkbox",
    ) ?? form.querySelector<HTMLElement>(`[name="${ref}"]`);

  focusControl(control ?? null);
}
