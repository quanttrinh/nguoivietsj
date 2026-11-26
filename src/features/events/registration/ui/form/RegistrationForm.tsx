// @boundary client
/* oxlint-disable eslint/max-lines-per-function -- registration form owns hydration, validation, submission, and success state. */
import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type { ResolvedRegistrationForm } from "~/features/events/domain/form-schema/resolve/resolve";
import type { ApiIssue } from "~/platform/contracts/response";

import { styles } from "../shared/registration-styles";
import type { PublicRegistrationConfig } from "../shared/registration-types";
import { Section } from "./fields/Section";
import {
  buildPayload,
  computeState,
  focusRegistrationField,
  readRegistrationValues,
  type RegistrationPayload,
  type RegistrationValues,
} from "./registration-form-state";
import { useTurnstileWidget } from "./registration-hooks";
import {
  postRegistration,
  postStaffRegistration,
  type RegistrationSuccess as RegistrationSuccessState,
} from "./registration-submit";
import {
  markRegistrationCompleteUrl,
  writeRegistrationSuccess,
} from "./registration-success-storage";
import { RegistrationSuccess } from "./RegistrationSuccess";

interface Notice {
  message: string;
  tone: "error" | "success";
  issues?: ApiIssue[] | undefined;
}

export function RegistrationForm({
  form,
  config: publicConfig,
  preview,
  staff,
  initialSuccess,
  onSuccess,
}: {
  form: ResolvedRegistrationForm;
  config: PublicRegistrationConfig;
  preview: boolean;
  staff: boolean;
  initialSuccess?: RegistrationSuccessState | null | undefined;
  onSuccess?: (() => void) | undefined;
}): JSX.Element {
  const formRef = useRef<HTMLFormElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const successRef = useRef<HTMLDivElement | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const [values, setValues] = useState<RegistrationValues>({
    get: () => "",
    checked: () => false,
  });
  const [initialized, setInitialized] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<RegistrationSuccessState | null>(initialSuccess ?? null);
  const client = form.client;
  const messages = publicConfig.labels.engineRegistration.errors;
  const showTurnstile = !preview && !staff && publicConfig.turnstile.siteKey.length > 0;
  const state = useMemo(() => computeState(values, client), [values, client]);

  useEffect((): void => {
    const formElement = formRef.current;

    if (formElement === null) {
      return;
    }

    setValues(readRegistrationValues(formElement));
    setInitialized(true);
  }, []);

  useEffect((): (() => void) | undefined => {
    const formElement = formRef.current;

    if (formElement === null) {
      return undefined;
    }

    let frame: number | null = null;

    const sync = (): void => {
      if (frame !== null) {
        return;
      }

      frame = requestAnimationFrame(() => {
        frame = null;
        setValues(readRegistrationValues(formElement));
        setErrors((current) => (Object.keys(current).length === 0 ? current : {}));
      });
    };

    formElement.addEventListener("input", sync);
    formElement.addEventListener("change", sync);
    formElement.addEventListener("valuechange", sync);
    formElement.addEventListener("checkedchange", sync);

    return (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      formElement.removeEventListener("input", sync);
      formElement.removeEventListener("change", sync);
      formElement.removeEventListener("valuechange", sync);
      formElement.removeEventListener("checkedchange", sync);
    };
  }, []);

  useTurnstileWidget(turnstileRef);

  useEffect(() => {
    if (notice !== null) {
      noticeRef.current?.focus();
    }
  }, [notice]);

  useEffect(() => {
    if (success !== null) {
      successRef.current?.focus();
    }
  }, [success]);

  const submit = async (
    formElement: HTMLFormElement,
    payload: RegistrationPayload,
  ): Promise<void> => {
    setSubmitting(true);
    const result = staff
      ? await postStaffRegistration(form.event.id, payload, messages)
      : await postRegistration(form.event.slug, payload, messages);

    if (result.status === "success") {
      writeRegistrationSuccess(staff, form.event.id, result.success);
      markRegistrationCompleteUrl();
      setSuccess(result.success);
      onSuccess?.();
    } else {
      if (result.status === "issues") {
        setErrors(result.errors);
        requestAnimationFrame(() => {
          focusRegistrationField(formElement, result.first.ref);
        });
      }

      setNotice({
        message: result.message,
        tone: "error",
        ...(result.status === "issues" ? { issues: result.issues } : {}),
      });
      const reset = async (): Promise<void> => {
        const { resetTurnstile } = await import("~/platform/client/turnstile");
        resetTurnstile(formElement);
      };

      void reset();
    }

    setSubmitting(false);
  };

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const formElement = formRef.current;

    if (formElement === null || submitting) {
      return;
    }

    const current = readRegistrationValues(formElement);
    const currentState = computeState(current, client);
    setValues(current);
    setErrors({});
    setNotice(null);

    if (staff) {
      // oxlint-disable-next-line eslint/no-alert -- Staff bypass confirmation uses the native prompt.
      if (!globalThis.confirm(messages.staffConfirm)) {
        return;
      }
    } else {
      if (!formElement.reportValidity()) {
        return;
      }

      if (turnstileRef.current !== null && current.get("turnstileToken").length === 0) {
        setNotice({ message: messages.turnstile, tone: "error" });
        return;
      }
    }

    const payload = buildPayload(current, client, currentState);

    if (!staff) {
      if (payload.contacts.length === 0) {
        setNotice({ message: messages.atLeastOneContact, tone: "error" });
        return;
      }

      if (!payload.tickets.some((ticket) => ticket.quantity > 0)) {
        setNotice({ message: messages.atLeastOneTicket, tone: "error" });
        return;
      }
    }

    void submit(formElement, payload);
  };

  const onReset = (): void => {
    setErrors({});
    setNotice(null);
    requestAnimationFrame(() => {
      const formElement = formRef.current;

      if (formElement !== null) {
        setValues(readRegistrationValues(formElement));
      }
    });
  };

  if (success !== null) {
    return (
      <div
        id="engine-registration-success"
        class={styles.success}
        role="status"
        tabIndex={-1}
        ref={successRef}
      >
        <RegistrationSuccess success={success} config={publicConfig} staff={staff} />
      </div>
    );
  }

  return (
    <>
      {preview ? (
        <div class={styles.errorBox} role="status">
          {publicConfig.labels.shared.previewOnlySubmissionIsDisabled}
        </div>
      ) : null}

      {staff ? (
        <div class={styles.errorBox} role="status">
          {messages.staffWarning}
        </div>
      ) : null}

      <form
        id="engine-registration-form"
        ref={formRef}
        class={styles.form}
        action={form.submit.action}
        method="post"
        aria-labelledby="engine-registration-heading"
        data-form-version={form.formVersion}
        novalidate
        onSubmit={onSubmit}
        onReset={onReset}
      >
        <div
          id="engine-registration-notice"
          ref={noticeRef}
          class={styles.errorPanel}
          role="alert"
          tabIndex={-1}
          hidden={notice === null}
        >
          {notice === null ? null : (
            <>
              <strong class={styles.errorTitle}>{messages.errorTitle}</strong>
              <span>{notice.message}</span>
              {notice.issues?.slice(1).map((issue) => (
                <span key={`${issue.code}:${issue.ref ?? issue.path ?? issue.message ?? "issue"}`}>
                  {issue.message ?? issue.code}
                </span>
              ))}
            </>
          )}
        </div>
        <noscript class={styles.notice}>
          <p class={styles.text}>{publicConfig.labels.engineRegistration.form.noscript}</p>
        </noscript>

        {form.sections.map((section) => (
          <Section
            key={section.key}
            section={section}
            config={publicConfig}
            client={client}
            values={values}
            state={state}
            errors={errors}
            initialized={initialized}
          />
        ))}

        {showTurnstile ? (
          <div
            ref={turnstileRef}
            class={styles.turnstile}
            data-turnstile
            data-sitekey={publicConfig.turnstile.siteKey}
            data-action={publicConfig.turnstile.action}
          />
        ) : null}

        {preview ? null : (
          <div class={styles.actions}>
            <qui-button
              id="engine-registration-submit"
              type="submit"
              variant="filled"
              size="lg"
              disabled={submitting}
            >
              {submitting
                ? publicConfig.labels.engineRegistration.form.submitting
                : publicConfig.labels.shared.register}
            </qui-button>
          </div>
        )}
      </form>
    </>
  );
}
