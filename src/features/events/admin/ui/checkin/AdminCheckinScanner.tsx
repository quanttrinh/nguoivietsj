// @boundary client
/* oxlint-disable eslint/max-lines-per-function -- Scanner keeps camera, manual entry, and result flow together. */
import type { JSX } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack } from "styled-system/patterns";
import { adminRefresh } from "~/features/events/admin/ui/shared/queries";
import { ticketSummary } from "~/features/events/domain/presentation";
import type { AdminCheckinScannerLabels as AdminCheckinLabels } from "~/generated/client/AdminCheckinScanner";
import {
  apiClient,
  apiErrorMessage,
  apiResponseMessage,
  readApiJson,
} from "~/platform/client/api/client";
import { focusControl, readFormValue } from "~/platform/client/form-controls";
import { clientLogger } from "~/platform/client/logger";
import { defaultLocale, type Locale as DeclaredLocales } from "~/platform/i18n";
import { noticeStyles } from "~/platform/ui/notice-styles";
import { dateTimeFormatter } from "~/platform/utils/format";
import { isUuidV7 } from "~/platform/utils/uuid";

interface AdminCheckinProps {
  labels: AdminCheckinLabels;
  locale: DeclaredLocales;
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

function extractRegistrationId(value: string) {
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

function formatDate(value: string) {
  const locale = document.documentElement.lang || defaultLocale;
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter(locale).format(date);
}

function scannerText(result: string | (string | Error)[]) {
  if (typeof result === "string") {
    return result;
  }

  return result.find((value): value is string => typeof value === "string") ?? null;
}

export default function AdminCheckinScanner({ labels }: AdminCheckinProps): JSX.Element {
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
      show(labels.engineCheckin.invalidCode, "error");
      return;
    }

    if (eventId == null) {
      show(labels.engineCheckin.checkinFailed, "error");
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

        show(apiResponseMessage(body, labels.engineCheckin.checkinFailed), "error");
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
      show(apiErrorMessage(error, labels.engineCheckin.checkinFailed), "error");
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
      show(labels.engineCheckin.cameraUnsupported, "error");
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
      show(labels.engineCheckin.cameraError, "error");
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
      show(labels.engineCheckin.undoSuccess, "success");
      adminRefresh.afterCheckinWrite(eventId);
    } catch (error) {
      clientLogger.error(error);
      show(apiErrorMessage(error, labels.engineCheckin.undoFailed), "error");
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
      <h2 class={styles.sectionTitle}>{labels.engineCheckin.scannerTitle}</h2>
      <p class={styles.sectionDescription}>{labels.engineCheckin.scannerHelp}</p>

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
          {labels.engineCheckin.startCamera}
        </qui-button>
        <qui-button type="button" variant="outlined" disabled={!scanning} onClick={stopCamera}>
          {labels.engineCheckin.stopCamera}
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
          <qui-field-label>{labels.shared.registrationID}</qui-field-label>
          <qui-input
            ref={manualInputRef}
            name="registrationId"
            placeholder={labels.engineCheckin.manualPlaceholder}
            autocomplete="off"
          />
        </qui-field>
        <div class={styles.actions}>
          <qui-button type="submit" variant="outlined">
            {labels.engineCheckin.lookUp}
          </qui-button>
        </div>
      </form>

      {result === null ? null : (
        <div ref={resultRef} class={styles.result} tabIndex={-1}>
          <h2 class={styles.resultName}>{result.registration.fullName}</h2>
          <p class={styles.resultText}>
            {result.alreadyCheckedIn
              ? labels.engineCheckin.alreadyCheckedIn
              : labels.engineCheckin.checkinSuccess}
          </p>
          <p class={styles.resultText}>
            {labels.shared.checkedInAt}: {formatDate(result.checkin.checkedInAt)}
          </p>
          <p class={styles.resultTickets}>{ticketSummary(result.registration.tickets)}</p>
          <div class={styles.actions}>
            <qui-button
              type="button"
              variant="outlined"
              disabled={busy}
              onClick={() => {
                void undo();
              }}
            >
              {labels.engineCheckin.undo}
            </qui-button>
            <qui-button type="button" variant="filled" onClick={scanAgain}>
              {labels.engineCheckin.scanAgain}
            </qui-button>
          </div>
        </div>
      )}
    </div>
  );
}
