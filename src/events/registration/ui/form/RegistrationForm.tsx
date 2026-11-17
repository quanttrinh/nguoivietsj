// @boundary client
/* oxlint-disable eslint/max-lines-per-function -- registration form owns hydration, validation, submission, and success state. */
import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type { ResolvedRegistrationForm } from "~/events/domain/form-schema/resolve/resolve";
import type { ApiIssue } from "~/shared/api/response";

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

export function RegistrationForm(props: {
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
  const [success, setSuccess] = useState<RegistrationSuccessState | null>(
    props.initialSuccess ?? null,
  );
  const config = props.form.client;
  const messages = props.config.messages;
  const showTurnstile = !props.preview && !props.staff && props.config.turnstile.siteKey.length > 0;
  const state = useMemo(() => computeState(values, config), [values, config]);

  useEffect((): void => {
    const form = formRef.current;

    if (form === null) {
      return;
    }

    setValues(readRegistrationValues(form));
    setInitialized(true);
  }, []);

  useEffect((): (() => void) | undefined => {
    const form = formRef.current;

    if (form === null) {
      return undefined;
    }

    let frame: number | null = null;

    const sync = (): void => {
      if (frame !== null) {
        return;
      }

      frame = requestAnimationFrame(() => {
        frame = null;
        setValues(readRegistrationValues(form));
        setErrors((current) => (Object.keys(current).length === 0 ? current : {}));
      });
    };

    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    form.addEventListener("valuechange", sync);
    form.addEventListener("checkedchange", sync);

    return (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      form.removeEventListener("input", sync);
      form.removeEventListener("change", sync);
      form.removeEventListener("valuechange", sync);
      form.removeEventListener("checkedchange", sync);
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

  const submit = async (form: HTMLFormElement, payload: RegistrationPayload): Promise<void> => {
    setSubmitting(true);
    const result = props.staff
      ? await postStaffRegistration(props.form.event.id, payload, messages)
      : await postRegistration(props.form.event.slug, payload, messages);

    if (result.status === "success") {
      writeRegistrationSuccess(props.staff, props.form.event.id, result.success);
      markRegistrationCompleteUrl();
      setSuccess(result.success);
      props.onSuccess?.();
    } else {
      if (result.status === "issues") {
        setErrors(result.errors);
        requestAnimationFrame(() => {
          focusRegistrationField(form, result.first.ref);
        });
      }

      setNotice({
        message: result.message,
        tone: "error",
        ...(result.status === "issues" ? { issues: result.issues } : {}),
      });
      const reset = async (): Promise<void> => {
        const { resetTurnstile } = await import("~/shared/client/turnstile");
        resetTurnstile(form);
      };

      void reset();
    }

    setSubmitting(false);
  };

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const form = formRef.current;

    if (form === null || submitting) {
      return;
    }

    const current = readRegistrationValues(form);
    const currentState = computeState(current, config);
    setValues(current);
    setErrors({});
    setNotice(null);

    if (props.staff) {
      // oxlint-disable-next-line eslint/no-alert -- Staff bypass confirmation uses the native prompt.
      if (!globalThis.confirm(messages.staffConfirm)) {
        return;
      }
    } else {
      if (!form.reportValidity()) {
        return;
      }

      if (turnstileRef.current !== null && current.get("turnstileToken").length === 0) {
        setNotice({ message: messages.turnstile, tone: "error" });
        return;
      }
    }

    const payload = buildPayload(current, config, currentState);

    if (!props.staff) {
      if (payload.contacts.length === 0) {
        setNotice({ message: messages.atLeastOneContact, tone: "error" });
        return;
      }

      if (!payload.tickets.some((ticket) => ticket.quantity > 0)) {
        setNotice({ message: messages.atLeastOneTicket, tone: "error" });
        return;
      }
    }

    void submit(form, payload);
  };

  const onReset = (): void => {
    setErrors({});
    setNotice(null);
    requestAnimationFrame(() => {
      const form = formRef.current;

      if (form !== null) {
        setValues(readRegistrationValues(form));
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
        <RegistrationSuccess success={success} config={props.config} staff={props.staff} />
      </div>
    );
  }

  return (
    <>
      {props.preview ? (
        <div class={styles.errorBox} role="status">
          {props.config.previewNotice}
        </div>
      ) : null}

      {props.staff ? (
        <div class={styles.errorBox} role="status">
          {messages.staffWarning}
        </div>
      ) : null}

      <form
        id="engine-registration-form"
        ref={formRef}
        class={styles.form}
        action={props.form.submit.action}
        method="post"
        aria-labelledby="engine-registration-heading"
        data-form-version={props.form.formVersion}
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
          <p class={styles.text}>{props.config.noscript}</p>
        </noscript>

        {props.form.sections.map((section) => (
          <Section
            key={section.key}
            section={section}
            config={props.config}
            client={config}
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
            data-sitekey={props.config.turnstile.siteKey}
            data-action={props.config.turnstile.action}
          />
        ) : null}

        {props.preview ? null : (
          <div class={styles.actions}>
            <qui-button
              id="engine-registration-submit"
              type="submit"
              variant="filled"
              size="lg"
              disabled={submitting}
            >
              {submitting ? messages.submitting : props.config.submit}
            </qui-button>
          </div>
        )}
      </form>
    </>
  );
}
