// @boundary client
import { navigate } from "astro:transitions/client";
import type { DeclaredLocales } from "intlayer";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { css, cx } from "styled-system/css";
import { vstack } from "styled-system/patterns";
import type { StatusContentValues } from "~/events/content/status.content";
import { EMAIL_PATTERN } from "~/events/domain/patterns";
import { STATUS_OTP_CODE_LENGTH } from "~/events/domain/status";
import { statusViewPath } from "~/events/domain/status-paths";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { focusControl, readControlValue } from "~/shared/client/form-controls";
import { clientLogger } from "~/shared/client/logger";
import { noticeStyles } from "~/shared/ui/notice-styles";

interface StatusRequestProps {
  labels: Pick<
    StatusContentValues,
    | "codeInvalid"
    | "codeLabel"
    | "codeSent"
    | "codeUnavailable"
    | "emailLabel"
    | "registrationId"
    | "requestCode"
    | "verifyCode"
  >;
  locale: DeclaredLocales;
}

type NoticeTone = "success" | "error";

interface NoticeState {
  message: string;
  tone: NoticeTone;
}

const styles = {
  // A transparent shell owns the outer space so the banner box stays unpadded.
  noticeShell: css({ paddingBlockEnd: "5" }),
  notice: cx(
    noticeStyles.notice,
    css({
      _focusVisible: {
        ringWidth: "thick",
        outlineStyle: "solid",
        ringColor: "tertiary",
        ringOffset: "0.5",
      },
    }),
  ),
  form: vstack({ alignItems: "stretch", gap: "4", maxW: "xl" }),
  codeForm: vstack({
    alignItems: "stretch",
    gap: "4",
    maxW: "xl",
    paddingBlockStart: "6",
  }),
};

export default function StatusRequest({ locale, labels }: StatusRequestProps): JSX.Element {
  const registrationInput = useRef<HTMLQuiInputElement>(null);
  const emailInput = useRef<HTMLQuiInputElement>(null);
  const codeInput = useRef<HTMLQuiInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [registrationId, setRegistrationId] = useState("");
  const [codeVisible, setCodeVisible] = useState(false);

  useEffect(() => {
    if (notice === null) {
      return;
    }

    noticeRef.current?.focus();
  }, [notice]);

  function show(text: string, tone: NoticeTone): void {
    setNotice({ message: text, tone });
  }

  async function requestCode(event: Event): Promise<void> {
    event.preventDefault();
    const idValue = await readControlValue(registrationInput.current);
    const emailValue = await readControlValue(emailInput.current);
    const id = idValue.trim();
    const email = emailValue.trim();

    if (id.length === 0 || email.length === 0) {
      show(labels.codeInvalid, "error");
      return;
    }

    try {
      await readApiJson(
        await apiClient.api.events.status.request.$post({
          json: { registrationId: id, email },
        }),
      );

      show(labels.codeSent, "success");
      setRegistrationId(id);
      setCodeVisible(true);
      requestAnimationFrame(() => {
        focusControl(codeInput.current);
      });
    } catch (error) {
      clientLogger.error(error);
      show(apiErrorMessage(error, labels.codeUnavailable), "error");
    }
  }

  async function verifyCode(event: Event): Promise<void> {
    event.preventDefault();
    const codeValue = await readControlValue(codeInput.current);
    const code = codeValue.trim();

    if (registrationId.length === 0 || code.length === 0) {
      show(labels.codeInvalid, "error");
      return;
    }

    try {
      await readApiJson(
        await apiClient.api.events.status.verify.$post({
          json: { registrationId, code },
        }),
      );

      await navigate(statusViewPath(locale));
    } catch (error) {
      clientLogger.error(error);
      show(labels.codeUnavailable, "error");
    }
  }

  return (
    <>
      <div class={styles.noticeShell} hidden={notice === null}>
        <div
          ref={noticeRef}
          class={styles.notice}
          role={notice?.tone === "error" ? "alert" : "status"}
          tabIndex={-1}
          data-tone={notice?.tone === "error" ? "error" : undefined}
        >
          {notice?.message}
        </div>
      </div>

      <form
        class={styles.form}
        novalidate
        onSubmit={(event) => {
          void requestCode(event);
        }}
      >
        <qui-field>
          <qui-field-label>{labels.registrationId}</qui-field-label>
          <qui-input
            ref={registrationInput}
            id="status-registration-id"
            name="registrationId"
            autocomplete="off"
            required
          />
        </qui-field>
        <qui-field>
          <qui-field-label>{labels.emailLabel}</qui-field-label>
          <qui-input
            ref={emailInput}
            id="status-email"
            name="email"
            inputType="text"
            inputModeHint="email"
            inputPattern={EMAIL_PATTERN}
            autocomplete="email"
            required
          />
        </qui-field>
        <qui-button type="submit" variant="filled">
          {labels.requestCode}
        </qui-button>
      </form>

      <form
        class={styles.codeForm}
        novalidate
        hidden={!codeVisible}
        onSubmit={(event) => {
          void verifyCode(event);
        }}
      >
        <qui-field>
          <qui-field-label>{labels.codeLabel}</qui-field-label>
          <qui-input
            ref={codeInput}
            id="status-code"
            name="code"
            inputModeHint="numeric"
            autocomplete="one-time-code"
            maxLength={STATUS_OTP_CODE_LENGTH}
            inputPattern={`\\d{${STATUS_OTP_CODE_LENGTH}}`}
            required
          />
        </qui-field>
        <qui-button type="submit" variant="filled">
          {labels.verifyCode}
        </qui-button>
      </form>
    </>
  );
}
