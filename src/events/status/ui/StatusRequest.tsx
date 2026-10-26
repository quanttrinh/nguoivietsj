import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack } from "styled-system/patterns";
import { focusControl, readControlValue } from "~/shared/client/form-controls";
import { STATUS_OTP_CODE_LENGTH } from "~/shared/constants/limits";

export interface StatusRequestConfig {
  locale: string;
  registrationId: string;
  emailLabel: string;
  requestCode: string;
  codeLabel: string;
  verifyCode: string;
  codeSent: string;
  rateLimited: string;
  codeUnavailable: string;
  codeInvalid: string;
  codeLocked: string;
  emailMismatch: string;
}

interface StatusResponse {
  token?: string;
  notice?: string;
  error?: string;
  registrationId?: string;
}

type NoticeTone = "success" | "error";

interface NoticeState {
  message: string;
  tone: NoticeTone;
}

const styles = {
  notice: css({
    borderRadius: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "tertiary",
    backgroundColor: "tertiaryContainer",
    color: "onTertiaryContainer",
    paddingInline: "4",
    paddingBlock: "3.5",
    fontSize: "sm",
    lineHeight: "relaxed",
    marginBlockEnd: "5",
    _focusVisible: {
      outlineWidth: "thick",
      outlineStyle: "solid",
      outlineColor: "tertiary",
      outlineOffset: "0.5",
    },
    '&[data-tone="error"]': {
      borderColor: "error",
      backgroundColor: "errorContainer",
      color: "onErrorContainer",
    },
  }),
  form: vstack({ alignItems: "stretch", gap: "4", maxWidth: "xl" }),
  codeForm: vstack({
    alignItems: "stretch",
    gap: "4",
    maxWidth: "xl",
    marginBlockStart: "6",
  }),
};

async function postJson<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T;

  if (!response.ok && response.status >= 500) {
    throw new Error(String(response.status));
  }

  return payload;
}

function message(config: StatusRequestConfig, code: string | undefined): string {
  if (code === "rate_limited") {
    return config.rateLimited;
  }
  if (code === "code_unavailable") {
    return config.codeUnavailable;
  }
  if (code === "code_locked") {
    return config.codeLocked;
  }
  if (code === "email_mismatch") {
    return config.emailMismatch;
  }
  return config.codeInvalid;
}

export default function StatusRequest(props: { config: StatusRequestConfig }): JSX.Element {
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
    const id = readControlValue(registrationInput.current).trim();
    const email = readControlValue(emailInput.current).trim();

    if (id.length === 0 || email.length === 0) {
      show(props.config.codeInvalid, "error");
      return;
    }

    try {
      const payload = await postJson<StatusResponse>("/api/events/status/request", {
        registrationId: id,
        email,
      });

      if (payload.error !== undefined) {
        show(message(props.config, payload.error), "error");
        return;
      }

      show(props.config.codeSent, "success");

      if (payload.registrationId !== undefined) {
        setRegistrationId(payload.registrationId);
        setCodeVisible(true);
        requestAnimationFrame(() => {
          focusControl(codeInput.current);
        });
      }
    } catch (error) {
      console.error(error);
      show(props.config.codeUnavailable, "error");
    }
  }

  async function verifyCode(event: Event): Promise<void> {
    event.preventDefault();
    const code = readControlValue(codeInput.current).trim();

    if (registrationId.length === 0 || code.length === 0) {
      show(props.config.codeInvalid, "error");
      return;
    }

    try {
      const payload = await postJson<StatusResponse>("/api/events/status/verify", {
        registrationId,
        code,
      });

      if (payload.token === undefined) {
        show(message(props.config, payload.error), "error");
        return;
      }

      globalThis.location.assign(
        `/${props.config.locale}/events/status/view?token=${encodeURIComponent(payload.token)}`,
      );
    } catch (error) {
      console.error(error);
      show(props.config.codeUnavailable, "error");
    }
  }

  return (
    <>
      <div
        ref={noticeRef}
        class={styles.notice}
        role={notice?.tone === "error" ? "alert" : "status"}
        tabIndex={-1}
        data-tone={notice?.tone === "error" ? "error" : undefined}
        hidden={notice === null}
      >
        {notice?.message}
      </div>

      <form
        class={styles.form}
        novalidate
        onSubmit={(event) => {
          void requestCode(event);
        }}
      >
        <qui-field>
          <qui-field-label>{props.config.registrationId}</qui-field-label>
          <qui-input
            ref={registrationInput}
            id="status-registration-id"
            name="registrationId"
            autocomplete="off"
            required
          />
        </qui-field>
        <qui-field>
          <qui-field-label>{props.config.emailLabel}</qui-field-label>
          <qui-input
            ref={emailInput}
            id="status-email"
            name="email"
            input-type="email"
            input-mode-hint="email"
            autocomplete="email"
            required
          />
        </qui-field>
        <qui-button type="submit" variant="filled">
          {props.config.requestCode}
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
          <qui-field-label>{props.config.codeLabel}</qui-field-label>
          <qui-input
            ref={codeInput}
            id="status-code"
            name="code"
            input-mode-hint="numeric"
            autocomplete="one-time-code"
            max-length={STATUS_OTP_CODE_LENGTH}
            input-pattern={`\\d{${STATUS_OTP_CODE_LENGTH}}`}
            required
          />
        </qui-field>
        <qui-button type="submit" variant="filled">
          {props.config.verifyCode}
        </qui-button>
      </form>
    </>
  );
}
