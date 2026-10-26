import { CONTACT_KIND } from "~/events/domain/constants";
import {
  FORM_CONFIRMATION_FIELD_NAME,
  FORM_CUSTOM_FIELD_TYPE,
  FORM_DEFAULT_MAIL_COUNTRY,
  FORM_MAIL_SUBFIELD,
  FORM_OVERRIDE_KEY,
  FORM_REF,
  REGISTRATION_ERROR,
  REGISTRATION_SOURCE,
  REGISTRATION_VALIDATION_CODE,
  contactFieldName,
  customRef,
  isGroupRef,
  mailFieldName,
  ticketFieldName,
} from "~/events/domain/form-schema/constants";
import type {
  EngineClientConfig,
  RegistrationFormIssue,
  RegistrationValidationCode,
} from "~/events/domain/form-schema/types";
/* oxlint-disable eslint/max-params, eslint/no-continue, eslint/no-nested-ternary, unicorn/no-nested-ternary, eslint/no-negated-condition, unicorn/no-negated-condition -- Imperative form control and error-message mapping are clearer as guards and compact branches. */
import { showNotice } from "~/shared/client/feedback";
import { readJsonScript } from "~/shared/client/json-script";
import { resetTurnstile } from "~/shared/client/turnstile";

const CUSTOM_ELEMENT_TAGS = [
  "qui-checkbox",
  "qui-field",
  "qui-input",
  "qui-radio-group",
  "qui-select",
  "qui-tabs",
  "qui-textarea",
] as const;

import {
  applyDefaults,
  applyState,
  clearErrors,
  focusRef,
  setFieldError,
  setGroupError,
} from "./dom";
import {
  computeState,
  customChecked,
  customRaw,
  formValue,
  groupMemberVisible,
  mailHasValue,
} from "./state";
import type { FormState, RegistrationMessages, RegistrationResponse } from "./types";

const VALIDATION_MESSAGE_KEY: Record<RegistrationValidationCode, keyof RegistrationMessages> = {
  [REGISTRATION_VALIDATION_CODE.required]: "required",
  [REGISTRATION_VALIDATION_CODE.invalidEmail]: "email",
  [REGISTRATION_VALIDATION_CODE.invalidPhone]: "phone",
  [REGISTRATION_VALIDATION_CODE.invalidPostalCode]: "postalCode",
  [REGISTRATION_VALIDATION_CODE.invalidNumber]: "invalidNumber",
  [REGISTRATION_VALIDATION_CODE.invalidOption]: "invalidOption",
  [REGISTRATION_VALIDATION_CODE.atLeastOneContact]: "atLeastOneContact",
  [REGISTRATION_VALIDATION_CODE.confirmationRequired]: "confirmationRequired",
  [REGISTRATION_VALIDATION_CODE.confirmationContact]: "confirmationContact",
  [REGISTRATION_VALIDATION_CODE.confirmationMultiple]: "confirmationMultiple",
  [REGISTRATION_VALIDATION_CODE.confirmationNotAllowed]: "confirmationNotAllowed",
  [REGISTRATION_VALIDATION_CODE.duplicateContact]: "duplicateContact",
  [REGISTRATION_VALIDATION_CODE.groupOneOf]: "groupOneOf",
  [REGISTRATION_VALIDATION_CODE.groupAtLeastOne]: "groupAtLeastOne",
  [REGISTRATION_VALIDATION_CODE.groupAllOf]: "groupAllOf",
  [REGISTRATION_VALIDATION_CODE.ticketUnavailable]: "ticketUnavailable",
  [REGISTRATION_VALIDATION_CODE.unknownAnswer]: "invalidValue",
  [REGISTRATION_VALIDATION_CODE.invalidValue]: "invalidValue",
};

function issueMessage(issue: RegistrationFormIssue, messages: RegistrationMessages): string {
  return messages[VALIDATION_MESSAGE_KEY[issue.code]];
}

function applyServerIssues(
  form: HTMLFormElement,
  issues: readonly RegistrationFormIssue[],
  messages: RegistrationMessages,
): string | null {
  clearErrors(form);
  let firstMessage: string | null = null;

  for (const issue of issues) {
    const message = issueMessage(issue, messages);
    firstMessage ??= message;

    if (isGroupRef(issue.ref)) {
      setGroupError(form, issue.ref, message);
    } else {
      setFieldError(form, issue.ref, message);
    }
  }

  const firstIssue = issues[0];

  if (firstIssue !== undefined) {
    focusRef(form, firstIssue.ref);
  }

  return firstMessage;
}

function buildPayload(
  formData: FormData,
  config: EngineClientConfig,
  state: FormState,
): Record<string, unknown> {
  const confirmation = formValue(formData, FORM_CONFIRMATION_FIELD_NAME);
  const contacts: Record<string, unknown>[] = [];
  const email = formValue(formData, contactFieldName(CONTACT_KIND.email));
  const phone = formValue(formData, contactFieldName(CONTACT_KIND.phone));

  if (groupMemberVisible(FORM_REF.contactEmail, formData, config) && email.length > 0) {
    contacts.push({
      kind: CONTACT_KIND.email,
      email,
      isConfirmation: confirmation === CONTACT_KIND.email,
    });
  }

  if (groupMemberVisible(FORM_REF.contactPhone, formData, config) && phone.length > 0) {
    contacts.push({
      kind: CONTACT_KIND.phone,
      phone,
      isConfirmation: confirmation === CONTACT_KIND.phone,
    });
  }

  if (groupMemberVisible(FORM_REF.contactMail, formData, config) && mailHasValue(formData)) {
    contacts.push({
      kind: CONTACT_KIND.mail,
      addressLine1: formValue(formData, mailFieldName(FORM_MAIL_SUBFIELD.addressLine1)),
      addressLine2: formValue(formData, mailFieldName(FORM_MAIL_SUBFIELD.addressLine2)) || null,
      city: formValue(formData, mailFieldName(FORM_MAIL_SUBFIELD.city)),
      province: formValue(formData, mailFieldName(FORM_MAIL_SUBFIELD.province)),
      postalCode: formValue(formData, mailFieldName(FORM_MAIL_SUBFIELD.postalCode)).toUpperCase(),
      country:
        formValue(formData, mailFieldName(FORM_MAIL_SUBFIELD.country)).toUpperCase() ||
        FORM_DEFAULT_MAIL_COUNTRY,
      isConfirmation: confirmation === CONTACT_KIND.mail,
    });
  }

  const answers: Record<string, unknown> = {};

  for (const field of config.customFields) {
    const ref = customRef(field.key);

    if (state.visible.get(ref) === false) {
      continue;
    }

    if (field.type === FORM_CUSTOM_FIELD_TYPE.checkbox) {
      if (customChecked(formData, field.key)) {
        answers[field.key] = true;
      }
      continue;
    }

    const raw = customRaw(formData, field.key);

    if (raw.length === 0) {
      continue;
    }

    answers[field.key] = field.type === FORM_CUSTOM_FIELD_TYPE.number ? Number(raw) : raw;
  }

  return {
    fullName: formValue(formData, FORM_OVERRIDE_KEY.fullName),
    contacts,
    tickets: config.tickets.map((ticket) => ({
      key: ticket.key,
      quantity: Number(formValue(formData, ticketFieldName(ticket.key)) || "0"),
    })),
    consent: true,
    formVersion: config.formVersion,
    turnstileToken: formValue(formData, "turnstileToken"),
    answers,
    metadata: {
      locale: config.locale,
      source: REGISTRATION_SOURCE,
    },
  };
}

function setSubmitting(
  submit: HTMLQuiButtonElement | null,
  originalText: string,
  submitting: string,
  busy: boolean,
): void {
  if (submit === null) {
    return;
  }

  submit.disabled = busy;
  submit.textContent = busy ? submitting : originalText;
}

async function submitRegistration(
  form: HTMLFormElement,
  config: EngineClientConfig,
  messages: RegistrationMessages,
  payload: Record<string, unknown>,
): Promise<void> {
  const notice = document.querySelector<HTMLElement>("#engine-registration-notice");
  const submit = document.querySelector<HTMLQuiButtonElement>("#engine-registration-submit");
  const submitText = submit?.textContent ?? "";
  const success = document.querySelector<HTMLElement>("#engine-registration-success");
  const reference = success?.querySelector<HTMLElement>("[data-registration-reference]");
  const statusLink = success?.querySelector<HTMLAnchorElement>("[data-registration-status]");

  let succeeded = false;

  setSubmitting(submit, submitText, messages.submitting, true);

  try {
    const response = await fetch(config.action, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => null)) as RegistrationResponse | null;

    if (!response.ok) {
      const issueErrorMessage =
        data?.issues === undefined ? null : applyServerIssues(form, data.issues, messages);

      if (issueErrorMessage !== null) {
        showNotice(notice, issueErrorMessage, "error");
        return;
      }

      const message =
        data?.error === REGISTRATION_ERROR.duplicate
          ? messages.duplicate
          : data?.error === REGISTRATION_ERROR.ticketLimit
            ? messages.ticketLimit
            : data?.error === REGISTRATION_ERROR.ticketTypeCapacity
              ? messages.ticketTypeLimit
              : data?.error === REGISTRATION_ERROR.eventCapacity
                ? messages.eventCapacity
                : data?.error === REGISTRATION_ERROR.registrationClosed
                  ? messages.registrationClosed
                  : data?.error === REGISTRATION_ERROR.eventUnavailable
                    ? messages.eventUnavailable
                    : data?.error === REGISTRATION_ERROR.rateLimited
                      ? messages.rateLimited
                      : data?.error === REGISTRATION_ERROR.turnstileRequired ||
                          data?.error === REGISTRATION_ERROR.turnstileFailed ||
                          data?.error === REGISTRATION_ERROR.turnstileUnavailable
                        ? messages.turnstile
                        : data?.error === REGISTRATION_ERROR.invalidPayload
                          ? messages.invalidPayload
                          : messages.submit;

      showNotice(notice, message, "error");
      return;
    }

    const id = data?.registration?.id ?? data?.id;

    if (id === undefined) {
      showNotice(notice, messages.submit, "error");
      return;
    }

    succeeded = true;

    if (success !== null) {
      if (reference !== null && reference !== undefined) {
        reference.textContent = id;
      }

      const statusUrl = data?.registration?.statusUrl;

      if (statusLink != null && statusUrl) {
        statusLink.href = statusUrl;
        statusLink.hidden = false;
      }

      form.hidden = true;

      if (submit !== null) {
        submit.hidden = true;
      }

      success.hidden = false;
      success.focus();
    } else {
      showNotice(notice, `${messages.successTitle}. ${messages.successBody}`, "success");
    }
  } catch (error) {
    console.error(error);
    showNotice(notice, messages.submit, "error");
  } finally {
    setSubmitting(submit, submitText, messages.submitting, false);

    if (!succeeded) {
      resetTurnstile(form);
    }
  }
}

function attachSubmit(
  form: HTMLFormElement,
  config: EngineClientConfig,
  messages: RegistrationMessages,
): void {
  document
    .querySelector<HTMLQuiButtonElement>("#engine-registration-submit")
    ?.addEventListener("click", () => {
      form.requestSubmit();
    });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const state = computeState(formData, config);

    applyState(form, config, formData, state);
    clearErrors(form);

    const turnstileToken = formValue(formData, "turnstileToken");

    if (form.querySelector("[data-turnstile]") !== null && turnstileToken.length === 0) {
      showNotice(
        document.querySelector<HTMLElement>("#engine-registration-notice"),
        messages.turnstile,
        "error",
      );
      return;
    }

    const payload = buildPayload(formData, config, state);
    void submitRegistration(form, config, messages, payload);
  });
}

function attachUpdates(form: HTMLFormElement, config: EngineClientConfig): void {
  let frame: number | null = null;

  const update = (): void => {
    const formData = new FormData(form);
    const state = computeState(formData, config);
    applyState(form, config, formData, state);
    clearErrors(form);
  };

  const schedule = (): void => {
    if (frame !== null) {
      return;
    }

    frame = requestAnimationFrame(() => {
      frame = null;
      update();
    });
  };

  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);
  form.addEventListener("valuechange", (event) => {
    const target = event.target;

    if (target instanceof HTMLElement && target.localName === "qui-tabs") {
      const group = target.closest<HTMLElement>("[data-group-key]");
      const input = group?.querySelector<HTMLInputElement>("[data-group-input]");

      if (input !== null && input !== undefined) {
        input.value = (target as HTMLQuiTabsElement).value ?? "";
      }
    }

    schedule();
  });
  form.addEventListener("checkedchange", (event) => {
    const target = event.target;

    if (target instanceof HTMLElement && target.localName === "qui-checkbox") {
      const detail = (event as CustomEvent<{ checked?: boolean | "indeterminate" }>).detail;

      if (detail?.checked !== undefined) {
        (target as HTMLQuiCheckboxElement).checked = detail.checked;
      }
    }

    schedule();
  });
  form.addEventListener("reset", () => {
    clearErrors(form);
    requestAnimationFrame(() => {
      applyDefaults(form, config);
      update();
    });
  });
}

export function initEngineRegistrationForm(): void {
  const form = document.querySelector<HTMLFormElement>("#engine-registration-form");

  if (form === null || form.dataset.ready === "true") {
    return;
  }

  form.dataset.ready = "true";

  const config = readJsonScript<EngineClientConfig>("engine-registration-config");
  const messages = readJsonScript<RegistrationMessages>("engine-registration-messages");

  if (config === null || messages === null) {
    return;
  }

  if (form.dataset.preview !== "true") {
    attachSubmit(form, config, messages);
  }

  attachUpdates(form, config);

  void (async (): Promise<void> => {
    await Promise.all(CUSTOM_ELEMENT_TAGS.map((tag) => customElements.whenDefined(tag)));
    applyDefaults(form, config);

    const formData = new FormData(form);
    const state = computeState(formData, config);
    applyState(form, config, formData, state);
  })();
}
