import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { localized } from "~/events/domain/localized";
import { apiErrorMessage } from "~/shared/client/api";
import "~/shared/client/qui-button";
import { useCachedJson } from "~/shared/client/use-cached-json";

import { adminEventUrl } from "../islands/shared/routes";

export interface AdminQrConfig {
  locale: string;
  qrTitle: string;
  qrHelp: string;
  printQr: string;
  openScanner: string;
  openPayments: string;
  paymentPendingQr: string;
  backToEvent: string;
  loadFailed: string;
  forbidden: string;
  eventNotFound: string;
  registrationNotFound: string;
  loading: string;
}

interface QrResponse {
  event: {
    id: string;
    title: Record<string, string>;
  };
  registration: {
    id: string;
    fullName: string;
  };
  qrAvailable: boolean;
  qrSvg: string | null;
}

const styles = {
  card: vstack({
    alignItems: "center",
    gap: "5",
    maxWidth: "xl",
    width: "full",
    marginInline: "auto",
  }),
  eyebrow: css({
    margin: "0",
    fontSize: "xs",
    fontWeight: "bold",
    letterSpacing: "widest",
    textTransform: "uppercase",
    color: "onSurfaceVariant",
  }),
  title: css({
    margin: "0",
    fontFamily: "display",
    fontSize: { base: "3xl", md: "4xl" },
    lineHeight: "none",
    letterSpacing: "tight",
    fontWeight: "bold",
    textAlign: "center",
  }),
  body: vstack({ alignItems: "center", gap: "4", width: "full" }),
  notice: css({
    margin: "0",
    borderRadius: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "error",
    backgroundColor: "errorContainer",
    color: "onErrorContainer",
    paddingInline: "4",
    paddingBlock: "3.5",
    fontSize: "sm",
    textAlign: "center",
  }),
  qr: css({
    width: "72",
    maxWidth: "full",
    borderRadius: "xl",
    backgroundColor: "white",
    padding: "4",
    boxShadow: "md",
  }),
  name: css({
    margin: "0",
    fontFamily: "display",
    fontSize: "2xl",
    fontWeight: "bold",
    textAlign: "center",
  }),
  help: css({
    margin: "0",
    fontSize: "sm",
    color: "onSurfaceVariant",
    textAlign: "center",
  }),
  actions: wrap({ align: "center", justify: "center", gap: "3" }),
};

interface ContentInput {
  params: { eventId: string; registrationId: string } | null | undefined;
  data: QrResponse | null;
  error: unknown;
  loading: boolean;
  config: AdminQrConfig;
}

function contentFor({ params, data, error, loading, config }: ContentInput): JSX.Element {
  if (params === undefined || loading) {
    return <p class={styles.notice}>{config.loading}</p>;
  }

  if (params === null) {
    return <p class={styles.notice}>{config.registrationNotFound}</p>;
  }

  if (error !== null && data === null) {
    return (
      <p class={styles.notice}>
        {apiErrorMessage(error, {
          loadFailed: config.loadFailed,
          forbidden: config.forbidden,
          notFound: config.eventNotFound,
        })}
      </p>
    );
  }

  if (data === null) {
    return <p class={styles.notice}>{config.loading}</p>;
  }

  return (
    <>
      <div class={styles.body}>
        {data.qrAvailable && data.qrSvg !== null ? (
          <>
            <p class={styles.help}>{config.qrHelp}</p>
            <div
              class={styles.qr}
              dangerouslySetInnerHTML={{
                __html: data.qrSvg,
              }}
            />
            <p class={styles.name}>{data.registration.fullName}</p>
          </>
        ) : (
          <p class={styles.notice}>{config.paymentPendingQr}</p>
        )}
      </div>
      <div class={styles.actions}>
        {data.qrAvailable ? null : (
          <qui-button
            variant="outlined"
            href={adminEventUrl(config.locale, {
              view: "payments",
              eventId: params.eventId,
            })}
          >
            {config.openPayments}
          </qui-button>
        )}
        <qui-button
          variant="filled"
          onClick={() => {
            globalThis.print();
          }}
        >
          {config.printQr}
        </qui-button>
        <qui-button
          variant="outlined"
          href={adminEventUrl(config.locale, {
            view: "checkin",
            eventId: params.eventId,
          })}
        >
          {config.openScanner}
        </qui-button>
        <qui-button
          variant="outlined"
          href={adminEventUrl(config.locale, { eventId: params.eventId })}
        >
          {config.backToEvent}
        </qui-button>
      </div>
    </>
  );
}

export default function AdminQr(props: { config: AdminQrConfig }): JSX.Element {
  const [params, setParams] = useState<
    { eventId: string; registrationId: string } | null | undefined
  >();

  useEffect(() => {
    const search = new URLSearchParams(globalThis.location.search);
    const eventId = search.get("event");
    const registrationId = search.get("registration");
    setParams(eventId === null || registrationId === null ? null : { eventId, registrationId });
  }, []);

  const api =
    params === undefined || params === null
      ? null
      : `/api/events/admin/events/${encodeURIComponent(params.eventId)}/registrations/${encodeURIComponent(params.registrationId)}/qr`;
  const { data, error, loading } = useCachedJson<QrResponse>(api);

  useEffect(() => {
    if (data === null) {
      return;
    }

    const heading = document.querySelector<HTMLElement>("#engine-qr-title");

    if (heading !== null) {
      heading.textContent = localized(data.event.title, props.config.locale, "");
    }

    document.title = `${props.config.qrTitle}: ${data.registration.fullName}`;
  }, [data, props.config]);

  const content = contentFor({
    params,
    data,
    error,
    loading,
    config: props.config,
  });

  return (
    <div class={styles.card}>
      <p class={styles.eyebrow}>{props.config.qrTitle}</p>
      <h1 data-title-preserve id="engine-qr-title" class={styles.title}>
        {props.config.qrTitle}
      </h1>
      {content}
    </div>
  );
}
