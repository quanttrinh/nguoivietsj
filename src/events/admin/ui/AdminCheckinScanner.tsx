/* oxlint-disable eslint/max-lines-per-function -- Scanner keeps camera, manual entry, and result flow together. */
import type { JSX } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack } from "styled-system/patterns";
import { focusControl, readControlValue } from "~/shared/client/form-controls";
import { API_ERROR } from "~/shared/constants/api-errors";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";
import { dateTimeFormatter } from "~/shared/utils/format";
import { isUuidV7 } from "~/shared/utils/uuid";

export interface AdminCheckinConfig {
  locale: string;
  eyebrow: string;
  fullName: string;
  checkedInAt: string;
  noRecent: string;
  loadFailed: string;
  forbidden: string;
  eventNotFound: string;
  scannerTitle: string;
  scannerHelp: string;
  startCamera: string;
  stopCamera: string;
  manualTitle: string;
  manualPlaceholder: string;
  lookUp: string;
  undo: string;
  scanAgain: string;
  cameraError: string;
  cameraUnsupported: string;
  invalidCode: string;
  checkinSuccess: string;
  alreadyCheckedIn: string;
  checkinFailed: string;
  registrationNotFound: string;
  paymentRequired: string;
  undoSuccess: string;
  undoFailed: string;
}

interface CheckinRegistration {
  id: string;
  fullName: string;
  tickets: { key: string; quantity: number }[];
}

interface CheckinResult {
  registration: CheckinRegistration;
  checkin: { registrationId: string; checkedInAt: string };
  alreadyCheckedIn: boolean;
}

interface CheckinResponse extends Partial<CheckinResult> {
  error?: string;
}

interface ScannerControls {
  stop: () => void;
}

type NoticeTone = "success" | "error";

interface NoticeState {
  message: string;
  tone: NoticeTone;
}

const styles = {
  scanner: vstack({ alignItems: "stretch", gap: "4" }),
  sectionTitle: css({
    margin: "0",
    fontFamily: "display",
    fontSize: "xl",
    fontWeight: "bold",
  }),
  sectionDescription: css({ margin: "0", fontSize: "sm", color: "onSurfaceVariant" }),
  field: vstack({ alignItems: "stretch", gap: "1.5" }),
  video: css({
    width: "full",
    maxWidth: "2xl",
    aspectRatio: "4 / 3",
    borderRadius: "xl",
    backgroundColor: "black",
    objectFit: "cover",
  }),
  manual: vstack({ alignItems: "stretch", gap: "3", maxWidth: "2xl" }),
  actions: css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3" }),
  result: vstack({
    gap: "2",
    borderRadius: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    backgroundColor: "surfaceContainerLow",
    padding: "5",
    _focusVisible: {
      outlineWidth: "thick",
      outlineStyle: "solid",
      outlineColor: "primary",
      outlineOffset: "2",
    },
  }),
  resultName: css({
    margin: "0",
    fontFamily: "display",
    fontSize: "2xl",
    fontWeight: "bold",
  }),
  resultText: css({ margin: "0", fontSize: "sm", color: "onSurfaceVariant" }),
  resultTickets: css({ margin: "0", fontSize: "sm", color: "onSurface" }),
  notice: css({
    margin: "0",
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
    '&[data-tone="error"]': {
      borderColor: "error",
      backgroundColor: "errorContainer",
      color: "onErrorContainer",
    },
  }),
};

function extractRegistrationId(value: string): string | null {
  const trimmed = value.trim();

  if (isUuidV7(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const lastSegment = segments.pop() ?? "";

    if (isUuidV7(lastSegment)) {
      return lastSegment;
    }
  } catch {
    // Not a URL; fall through.
  }

  return null;
}

function formatDate(value: string): string {
  const locale = document.documentElement.lang || DEFAULT_LOCALE;
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter(locale).format(date);
}

export default function AdminCheckinScanner(props: { config: AdminCheckinConfig }): JSX.Element {
  const [eventId, setEventId] = useState<string | null | undefined>();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const manualInputRef = useRef<HTMLQuiInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    setEventId(new URLSearchParams(globalThis.location.search).get("event"));
  }, []);

  const cleanupCamera = useCallback((): void => {
    controlsRef.current?.stop();
    controlsRef.current = null;

    if (videoRef.current !== null) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopCamera = useCallback((): void => {
    cleanupCamera();
    setScanning(false);
  }, [cleanupCamera]);

  useEffect(() => {
    mountedRef.current = true;

    return (): void => {
      mountedRef.current = false;
      cleanupCamera();
    };
  }, [cleanupCamera]);

  useEffect(() => {
    if (notice !== null) {
      noticeRef.current?.focus();
    }
  }, [notice]);

  useEffect(() => {
    if (result !== null) {
      resultRef.current?.focus();
    }
  }, [result]);

  const api =
    eventId === undefined || eventId === null
      ? null
      : `/api/events/admin/events/${encodeURIComponent(eventId)}/checkins`;

  function show(message: string, tone: NoticeTone): void {
    setNotice({ message, tone });
  }

  async function checkIn(value: string): Promise<void> {
    if (busy) {
      return;
    }

    const registrationId = extractRegistrationId(value);

    if (registrationId === null) {
      show(props.config.invalidCode, "error");
      return;
    }

    if (api === null) {
      show(props.config.checkinFailed, "error");
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      const data = (await response.json().catch(() => null)) as CheckinResponse | null;

      if (!response.ok || data?.registration === undefined || data.checkin === undefined) {
        let message = props.config.checkinFailed;

        if (data?.error === API_ERROR.registrationNotFound) {
          message = props.config.registrationNotFound;
        } else if (data?.error === API_ERROR.paymentRequired) {
          message = props.config.paymentRequired;
        }

        show(message, "error");
        return;
      }

      setResult(data as CheckinResult);
      setNotice(null);
    } catch (error) {
      console.error(error);
      show(props.config.checkinFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera(): Promise<void> {
    if (controlsRef.current !== null || busy || scanning) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      show(props.config.cameraUnsupported, "error");
      focusControl(manualInputRef.current);
      return;
    }

    setScanning(true);
    setNotice(null);

    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const video = videoRef.current;

      if (video === null) {
        setScanning(false);
        return;
      }

      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        video,
        (decoded, _error, scannerControls) => {
          if (decoded === undefined || busy) {
            return;
          }

          scannerControls.stop();
          controlsRef.current = null;
          video.srcObject = null;
          setScanning(false);
          void checkIn(decoded.getText());
        },
      );

      if (!mountedRef.current) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
    } catch (error) {
      console.error(error);
      controlsRef.current = null;

      if (videoRef.current !== null) {
        videoRef.current.srcObject = null;
      }

      setScanning(false);
      show(props.config.cameraError, "error");
      focusControl(manualInputRef.current);
    }
  }

  async function undo(): Promise<void> {
    const registrationId = result?.registration.id;

    if (registrationId === undefined || api === null || busy) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`${api}/${encodeURIComponent(registrationId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        show(props.config.undoFailed, "error");
        return;
      }

      setResult(null);
      show(props.config.undoSuccess, "success");
    } catch (error) {
      console.error(error);
      show(props.config.undoFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  function scanAgain(): void {
    setResult(null);

    if (manualInputRef.current !== null) {
      manualInputRef.current.value = "";
    }

    focusControl(manualInputRef.current);
    void startCamera();
  }

  return (
    <div class={styles.scanner}>
      <h2 class={styles.sectionTitle}>{props.config.scannerTitle}</h2>
      <p class={styles.sectionDescription}>{props.config.scannerHelp}</p>

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

      <video ref={videoRef} class={styles.video} playsinline muted />

      <div class={styles.actions}>
        <qui-button
          type="button"
          variant="filled"
          disabled={scanning}
          onClick={() => {
            void startCamera();
          }}
        >
          {props.config.startCamera}
        </qui-button>
        <qui-button type="button" variant="outlined" disabled={!scanning} onClick={stopCamera}>
          {props.config.stopCamera}
        </qui-button>
      </div>

      <form
        class={styles.manual}
        novalidate
        onSubmit={(event) => {
          event.preventDefault();
          stopCamera();
          void checkIn(readControlValue(manualInputRef.current));
        }}
      >
        <qui-field class={styles.field}>
          <qui-field-label>{props.config.manualTitle}</qui-field-label>
          <qui-input
            ref={manualInputRef}
            name="registrationId"
            placeholder={props.config.manualPlaceholder}
            autocomplete="off"
          />
          <qui-field-helper-text>{props.config.manualPlaceholder}</qui-field-helper-text>
        </qui-field>
        <div class={styles.actions}>
          <qui-button type="submit" variant="outlined">
            {props.config.lookUp}
          </qui-button>
        </div>
      </form>

      {result === null ? null : (
        <div ref={resultRef} class={styles.result} tabIndex={-1}>
          <h2 class={styles.resultName}>{result.registration.fullName}</h2>
          <p class={styles.resultText}>
            {result.alreadyCheckedIn ? props.config.alreadyCheckedIn : props.config.checkinSuccess}
          </p>
          <p class={styles.resultText}>
            {props.config.checkedInAt}: {formatDate(result.checkin.checkedInAt)}
          </p>
          <p class={styles.resultTickets}>
            {result.registration.tickets
              .map((ticket) => `${ticket.key} × ${ticket.quantity}`)
              .join(", ")}
          </p>
          <div class={styles.actions}>
            <qui-button
              type="button"
              variant="outlined"
              disabled={busy}
              onClick={() => {
                void undo();
              }}
            >
              {props.config.undo}
            </qui-button>
            <qui-button type="button" variant="filled" onClick={scanAgain}>
              {props.config.scanAgain}
            </qui-button>
          </div>
        </div>
      )}
    </div>
  );
}
