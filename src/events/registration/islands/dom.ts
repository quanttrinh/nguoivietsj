import { CONTACT_KIND } from "~/events/domain/constants";
/* oxlint-disable eslint/max-params, eslint/no-continue, eslint/no-negated-condition, unicorn/no-negated-condition -- Imperative form control logic is clearer with guards. */
import {
  FORM_CUSTOM_FIELD_TYPE,
  FORM_GROUP_RENDERER,
  FORM_REF,
  FORM_REF_PREFIX,
  contactFieldName,
  customRef,
  isContactRef,
  isCustomRef,
  isGroupRef,
  refKey,
} from "~/events/domain/form-schema/constants";
import type { EngineClientConfig } from "~/events/domain/form-schema/types";
import { defaultValueText } from "~/events/domain/presentation";

import {
  contactRequired,
  fieldElement,
  groupConfig,
  groupMemberVisible,
  readGroupValue,
} from "./state";
import type { FormState } from "./types";

export function applyRequired(form: HTMLFormElement, ref: string, required: boolean): void {
  const fields =
    ref === FORM_REF.contactMail
      ? form.querySelectorAll<HTMLQuiFieldElement>(
          `[data-field-ref^="${contactFieldName(CONTACT_KIND.mail)}."]`,
        )
      : form.querySelectorAll<HTMLQuiFieldElement>(`[data-field-ref="${ref}"]`);

  for (const field of fields) {
    field.required = required;

    const control = field.querySelector<HTMLElement & { required?: boolean }>(
      "qui-input, qui-textarea, qui-select, qui-radio-group, qui-checkbox",
    );

    if (control !== null) {
      control.required = required;
    }
  }
}

export function applyGroupRequired(form: HTMLFormElement, ref: string, required: boolean): void {
  const wrapper = form.querySelector<HTMLElement>(`[data-ref="${ref}"]`);

  if (wrapper === null) {
    return;
  }

  const control = wrapper.querySelector<HTMLQuiRadioGroupElement>("qui-radio-group");

  if (control !== null) {
    control.required = required;
  }
}

export function applyGroupPanels(
  form: HTMLFormElement,
  config: EngineClientConfig,
  formData: FormData,
  state: FormState,
): void {
  for (const group of config.groups) {
    if (
      group.renderer !== FORM_GROUP_RENDERER.radio &&
      group.renderer !== FORM_GROUP_RENDERER.tabs
    ) {
      continue;
    }

    const wrapper = form.querySelector<HTMLElement>(`[data-group-key="${group.key}"]`);

    if (wrapper === null) {
      continue;
    }

    const selected = readGroupValue(formData, group.key);

    for (const panel of wrapper.querySelectorAll<HTMLElement>("[data-group-member]")) {
      const memberRef = panel.dataset.groupMember;

      if (memberRef === undefined) {
        continue;
      }

      const customVisible = isCustomRef(memberRef) ? (state.visible.get(memberRef) ?? true) : true;
      panel.hidden = selected !== memberRef || !customVisible;
    }

    if (group.renderer === FORM_GROUP_RENDERER.tabs) {
      const tabs = wrapper.querySelector<HTMLQuiTabsElement>("qui-tabs");
      const input = wrapper.querySelector<HTMLInputElement>("[data-group-input]");

      if (tabs !== null && input !== null) {
        input.value = tabs.value ?? selected;
      }
    }
  }
}

export function applySections(form: HTMLFormElement): void {
  for (const section of form.querySelectorAll<HTMLElement>("[data-section]")) {
    const fields = section.querySelectorAll<HTMLElement>("[data-fields] > [data-ref]");
    const visible = [...fields].some((field) => !field.hidden);
    section.hidden = !visible;
  }
}

export function applyState(
  form: HTMLFormElement,
  config: EngineClientConfig,
  formData: FormData,
  state: FormState,
): void {
  for (const wrapper of form.querySelectorAll<HTMLElement>("[data-ref]")) {
    const ref = wrapper.dataset.ref;

    if (ref === undefined) {
      continue;
    }

    let visible = true;
    let required = false;

    if (isCustomRef(ref)) {
      visible = state.visible.get(ref) ?? true;
      required = state.required.get(ref) ?? false;
    } else if (isContactRef(ref)) {
      visible = groupMemberVisible(ref, formData, config);
      required = contactRequired(ref, config);
    } else if (isGroupRef(ref)) {
      const group = groupConfig(config, refKey(ref, FORM_REF_PREFIX.group) ?? "");
      required = group?.required ?? false;
    }

    wrapper.hidden = !visible;
    wrapper.setAttribute("aria-hidden", String(!visible));

    if (isCustomRef(ref) || isContactRef(ref)) {
      applyRequired(form, ref, visible && required);
    } else if (isGroupRef(ref)) {
      applyGroupRequired(form, ref, visible && required);
    }
  }

  applyGroupPanels(form, config, formData, state);
  applySections(form);
}

export function applyDefaults(form: HTMLFormElement, config: EngineClientConfig): void {
  for (const field of config.customFields) {
    if (field.defaultValue === undefined) {
      continue;
    }

    const control = form.querySelector<HTMLElement>(`[name="${customRef(field.key)}"]`);

    if (control === null) {
      continue;
    }

    if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
      (control as HTMLQuiCheckboxElement).checked = field.defaultValue === true;
    } else if (field.type === FORM_CUSTOM_FIELD_TYPE.select) {
      (control as HTMLQuiSelectElement).value = [defaultValueText(field.defaultValue)];
    } else if (field.type === FORM_CUSTOM_FIELD_TYPE.radio) {
      (control as HTMLQuiRadioGroupElement).value = defaultValueText(field.defaultValue);
    } else {
      (control as HTMLQuiInputElement).value = defaultValueText(field.defaultValue);
    }
  }
}

export function clearErrors(form: HTMLFormElement): void {
  for (const field of form.querySelectorAll<HTMLQuiFieldElement>("[data-field-ref]")) {
    field.invalid = false;
  }

  for (const group of form.querySelectorAll<HTMLElement>("[data-group-key]")) {
    const error = group.querySelector<HTMLElement>("[data-group-error]");
    const control = group.querySelector<HTMLQuiRadioGroupElement>("qui-radio-group");

    if (error !== null) {
      error.hidden = true;
      error.textContent = "";
    }

    if (control !== null) {
      control.invalid = false;
    }
  }
}

export function setFieldError(form: HTMLFormElement, ref: string, message: string): void {
  const fields = form.querySelectorAll<HTMLQuiFieldElement>(`[data-field-ref="${ref}"]`);

  for (const field of fields) {
    field.invalid = true;

    const error = field.querySelector<HTMLElement>("qui-field-error-text [data-error-message]");

    if (error !== null) {
      error.textContent = message;
    }
  }
}

export function setGroupError(form: HTMLFormElement, ref: string, message: string): void {
  const key = refKey(ref, FORM_REF_PREFIX.group) ?? "";
  const wrapper = form.querySelector<HTMLElement>(`[data-group-key="${key}"]`);

  if (wrapper === null) {
    return;
  }

  const error = wrapper.querySelector<HTMLElement>("[data-group-error]");
  const control = wrapper.querySelector<HTMLQuiRadioGroupElement>("qui-radio-group");

  if (error !== null) {
    error.hidden = false;
    error.textContent = message;
  }

  if (control !== null) {
    control.invalid = true;
  }
}

export function focusRef(form: HTMLFormElement, ref: string): void {
  if (isGroupRef(ref)) {
    const wrapper = form.querySelector<HTMLElement>(
      `[data-group-key="${refKey(ref, FORM_REF_PREFIX.group) ?? ""}"]`,
    );
    const control = wrapper?.querySelector<HTMLElement & { focusControl?: () => Promise<void> }>(
      "qui-radio-group, [data-group-input]",
    );

    if (control?.focusControl !== undefined) {
      void control.focusControl();
    } else {
      control?.focus();
    }

    return;
  }

  const field = fieldElement(form, ref);
  const control = field?.querySelector<HTMLElement & { focusControl?: () => Promise<void> }>(
    "qui-input, qui-textarea, qui-select, qui-radio-group, qui-checkbox",
  );

  if (control?.focusControl !== undefined) {
    void control.focusControl();
  } else {
    control?.focus();
  }
}
