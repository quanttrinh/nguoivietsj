import { CONTACT_KIND } from "~/events/domain/constants";
/* oxlint-disable eslint/max-params -- Condition readers take explicit form/config context. */
import { evaluateCondition } from "~/events/domain/form-schema/conditions/evaluate";
import {
  FORM_CUSTOM_FIELD_TYPE,
  FORM_GROUP_RENDERER,
  FORM_MAIL_SUBFIELD,
  FORM_REF,
  FORM_REF_PREFIX,
  contactKindFromConditionRef,
  contactRef,
  mailFieldName,
  customRef,
  groupRef,
  isContactConditionRef,
  isCustomRef,
  isGroupConditionRef,
  isTicketConditionRef,
  refKey,
  ticketFieldName,
} from "~/events/domain/form-schema/constants";
import type { EngineClientConfig } from "~/events/domain/form-schema/types";
import { readFormChecked, readFormValue } from "~/shared/client/form-controls";

import type { FormState } from "./types";

function registrationForm(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>("#engine-registration-form");
}

export function formValue(formData: FormData, name: string): string {
  const submitted = formData.get(name);

  if (typeof submitted === "string" && submitted.length > 0) {
    return submitted.trim();
  }

  const form = registrationForm();
  return form === null ? "" : readFormValue(form, name).trim();
}

export function formChecked(formData: FormData, name: string): boolean {
  if (formData.has(name)) {
    return true;
  }

  const form = registrationForm();
  return form !== null && readFormChecked(form, name);
}

export function fieldElement(form: HTMLFormElement, ref: string): HTMLQuiFieldElement | null {
  return form.querySelector<HTMLQuiFieldElement>(`[data-field-ref="${ref}"]`);
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

export function readGroupValue(formData: FormData, key: string): string {
  return formValue(formData, groupRef(key));
}

export function mailHasValue(formData: FormData): boolean {
  return [
    mailFieldName(FORM_MAIL_SUBFIELD.addressLine1),
    mailFieldName(FORM_MAIL_SUBFIELD.addressLine2),
    mailFieldName(FORM_MAIL_SUBFIELD.city),
    mailFieldName(FORM_MAIL_SUBFIELD.province),
    mailFieldName(FORM_MAIL_SUBFIELD.postalCode),
  ].some((name) => formValue(formData, name).length > 0);
}

export function readCustomValue(
  formData: FormData,
  config: EngineClientConfig,
  key: string,
): string | number | boolean | null {
  const field = customFieldConfig(config, key);

  if (field === undefined) {
    return null;
  }

  const name = customRef(key);

  if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
    return formChecked(formData, name);
  }

  const raw = formValue(formData, name);

  if (raw.length === 0) {
    return null;
  }

  return field.type === FORM_CUSTOM_FIELD_TYPE.number ? Number(raw) : raw;
}

export function groupMemberVisible(
  ref: string,
  formData: FormData,
  config: EngineClientConfig,
): boolean {
  const group = config.groups.find((candidate) => candidate.members.includes(ref));

  if (group === undefined) {
    return true;
  }

  if (group.renderer === FORM_GROUP_RENDERER.radio || group.renderer === FORM_GROUP_RENDERER.tabs) {
    return readGroupValue(formData, group.key) === ref;
  }

  return true;
}

export function readConditionValue(
  ref: string,
  formData: FormData,
  config: EngineClientConfig,
  state: FormState,
): string | number | boolean | null {
  if (isCustomRef(ref)) {
    if (state.visible.get(ref) === false) {
      return null;
    }

    return readCustomValue(formData, config, refKey(ref, FORM_REF_PREFIX.custom) ?? "");
  }

  if (isContactConditionRef(ref)) {
    const kind = contactKindFromConditionRef(ref) ?? "";
    const systemRef = contactRef(kind);

    if (!groupMemberVisible(systemRef, formData, config)) {
      return null;
    }

    if (kind === CONTACT_KIND.mail) {
      return mailHasValue(formData);
    }

    return formValue(formData, ref);
  }

  if (isGroupConditionRef(ref)) {
    return readGroupValue(formData, refKey(ref, FORM_REF_PREFIX.group) ?? "");
  }

  if (isTicketConditionRef(ref)) {
    const key = refKey(ref, FORM_REF_PREFIX.ticket) ?? "";
    const raw = formValue(formData, ticketFieldName(key));
    return raw.length === 0 ? 0 : Number(raw);
  }

  if (ref === FORM_REF_PREFIX.consent) {
    return formChecked(formData, FORM_REF_PREFIX.consent);
  }

  return null;
}

export function computeState(formData: FormData, config: EngineClientConfig): FormState {
  const visible = new Map<string, boolean>();
  const required = new Map<string, boolean>();

  for (const field of config.customFields) {
    const ref = customRef(field.key);
    visible.set(ref, true);
    required.set(ref, field.required);
  }

  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;

    for (const field of config.customFields) {
      const ref = customRef(field.key);
      const condition = config.conditions[ref];
      const visibleCondition = condition?.visibleWhen ?? null;
      const requiredCondition = condition?.requiredWhen ?? null;
      const groupVisible = groupMemberVisible(ref, formData, config);
      const conditionVisible =
        visibleCondition === null ||
        evaluateCondition(visibleCondition, (target) =>
          readConditionValue(target, formData, config, { visible, required }),
        );
      const nextVisible = groupVisible && conditionVisible;
      const nextRequired =
        field.required ||
        (nextVisible &&
          requiredCondition !== null &&
          evaluateCondition(requiredCondition, (target) =>
            readConditionValue(target, formData, config, { visible, required }),
          ));

      if (visible.get(ref) !== nextVisible || required.get(ref) !== nextRequired) {
        visible.set(ref, nextVisible);
        required.set(ref, nextRequired);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  return { visible, required };
}

export function customRaw(formData: FormData, key: string): string {
  return formValue(formData, customRef(key));
}

export function customChecked(formData: FormData, key: string): boolean {
  return formChecked(formData, customRef(key));
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
