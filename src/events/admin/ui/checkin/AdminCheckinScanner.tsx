// @boundary client
/* oxlint-disable eslint/max-lines-per-function -- Scanner keeps camera, manual entry, and result flow together. */
import type { JSX } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack } from "styled-system/patterns";
import { adminRefresh } from "~/events/admin/ui/shared/queries";
import {
  apiClient,
  apiErrorMessage,
  apiResponseMessage,
  readApiJson,
} from "~/shared/client/api/client";
import { focusControl, readFormValue } from "~/shared/client/form-controls";
import { clientLogger } from "~/shared/client/logger";
import { DEFAULT_LOCALE } from "~/shared/constants/locales";
import { noticeStyles } from "~/shared/ui/notice-styles";
import { dateTimeFormatter } from "~/shared/utils/format";
import { isUuidV7 } from "~/shared/utils/uuid";

export interface AdminCheckinConfig {
  locale: string;
  fullName: string;
  checkedInAt: string;
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
    textStyle: "title-md",
  }),
  sectionDescription: css({ fontSize: "sm", color: "onSurfaceVariant" }),
  field: vstack({ alignItems: "stretch", gap: "1.5" }),
  video: css({
    w: "full",
    maxW: "2xl",
    aspectRatio: "landscape",
    rounded: "xl",
    bgColor: "black",
    objectFit: "cover",
  }),
  manual: vstack({ alignItems: "stretch", gap: "3", maxW: "2xl" }),
  actions: css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3" }),
  result: vstack({
    gap: "2",
    rounded: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerLow",
    p: "5",
    _focusVisible: {
      ringWidth: "thick",
      outlineStyle: "solid",
      ringColor: "primary",
      ringOffset: "2",
    },
  }),
  resultName: css({
    textStyle: "name-lg",
  }),
  resultText: css({ fontSize: "sm", color: "onSurfaceVariant" }),
  resultTickets: css({ fontSize: "sm", color: "onSurface" }),
  notice: noticeStyles.notice,
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

function scannerText(result: string | (string | Error)[]): string | null {
  if (typeof result === "string") {
    return result;
  }

  return result.find((value): value is string => typeof value === "string") ?? null;
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

    if (eventId == null) {
      show(props.config.checkinFailed, "error");
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const response = await apiClient.api.admin.events[":eventId"].registrations[
        ":registrationId"
      ].checkin.$post({
        param: { eventId, registrationId },
      });

      if (!response.ok) {
        const body = await response.json();

        show(apiResponseMessage(body, props.config.checkinFailed), "error");
        return;
      }

      const { data } = await response.json();

      setResult({
        registration: data.registration,
        checkin: data.checkin,
        alreadyCheckedIn: data.alreadyCheckedIn,
      });
      setNotice(null);
      adminRefresh.afterCheckinWrite(eventId);
    } catch (error) {
      clientLogger.error(error);
      show(apiErrorMessage(error, props.config.checkinFailed), "error");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera(): Promise<void> {
    if (controlsRef.current !== null || busy || scanning) {
      return;
    }

    // oxlint-disable-next-line typescript/no-unnecessary-condition -- omitted on insecure origins, despite lib.dom.
    if (navigator.mediaDevices?.getUserMedia === undefined) {
      show(props.config.cameraUnsupported, "error");
      focusControl(manualInputRef.current);
      return;
    }

    setScanning(true);
    setNotice(null);

    try {
      const { QRCanvas, frameLoop, rearCamera } = await import("qr/dom.js");
      const video = videoRef.current;

      if (video === null) {
        setScanning(false);
        return;
      }

      const canvas = new QRCanvas();
      const camera = await rearCamera(video);
      let cancel: (() => void) | null = null;
      let reading = false;
      let logged = false;

      const stop = (): void => {
        cancel?.();
        camera.stop();
      };

      const readFrame = async (): Promise<void> => {
        if (reading) {
          return;
        }

        reading = true;

        try {
          const decoded = await camera.readFrame(canvas);

          if (decoded === undefined || !mountedRef.current) {
            return;
          }

          const text = scannerText(decoded);

          if (text === null) {
            return;
          }

          stop();
          controlsRef.current = null;
          video.srcObject = null;
          setScanning(false);
          void checkIn(text);
        } catch (error) {
          if (!logged) {
            logged = true;
            clientLogger.error(error);
          }
        } finally {
          reading = false;
        }
      };

      cancel = frameLoop(() => {
        void readFrame();
      }, video);

      if (!mountedRef.current) {
        stop();
        return;
      }

      controlsRef.current = { stop };
    } catch (error) {
      clientLogger.error(error);
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

    if (registrationId === undefined || eventId == null || busy) {
      return;
    }

    setBusy(true);

    try {
      await readApiJson(
        await apiClient.api.admin.events[":eventId"].registrations[
          ":registrationId"
        ].checkin.$delete({
          param: { eventId, registrationId },
        }),
      );

      setResult(null);
      show(props.config.undoSuccess, "success");
      adminRefresh.afterCheckinWrite(eventId);
    } catch (error) {
      clientLogger.error(error);
      show(apiErrorMessage(error, props.config.undoFailed), "error");
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
          void checkIn(readFormValue(event.currentTarget, "registrationId"));
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
