// @boundary client
import type { InferResponseType } from "hono/client";
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { adminQueries } from "~/events/admin/ui/shared/queries";
import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { apiClient, apiErrorMessage } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";

import EventTitle from "../shared/EventTitle";

export interface AdminQrConfig {
  locale: string;
  qrTitle: string;
  qrHelp: string;
  printQr: string;
  openScanner: string;
  openPayments: string;
  paymentPendingQr: string;
  loadFailed: string;
  forbidden: string;
  eventNotFound: string;
  registrationNotFound: string;
  loading: string;
}

const getRegistrationQr =
  apiClient.api.admin.events[":eventId"].registrations[":registrationId"].qr.$get;
type QrResponse = InferResponseType<typeof getRegistrationQr, 200>["data"];

const styles = {
  shell: vstack({ alignItems: "center" }),
  card: vstack({
    alignItems: "center",
    gap: "5",
    maxW: "xl",
    w: "full",
  }),
  title: css({
    textStyle: { base: "headline-sm", md: "headline-md" },
    textAlign: "center",
  }),
  body: vstack({ alignItems: "center", gap: "4", w: "full" }),
  notice: css({
    rounded: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "error",
    bgColor: "errorContainer",
    color: "onErrorContainer",
    px: "4",
    py: "3.5",
    fontSize: "sm",
    textAlign: "center",
  }),
  qr: css({
    w: "72",
    maxW: "full",
    rounded: "xl",
    bgColor: "white",
    p: "4",
    shadow: "md",
  }),
  name: css({
    textStyle: "name-lg",
    textAlign: "center",
  }),
  help: css({
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
    return <p class={styles.notice}>{apiErrorMessage(error, config.loadFailed)}</p>;
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

  const { data, error, loading } = useQuery(
    params == null ? null : adminQueries.registrationQr(params.eventId, params.registrationId),
  );

  useEffect(() => {
    if (data === null) {
      return;
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
    <div class={styles.shell}>
      <div class={styles.card}>
        <EventTitle locale={props.config.locale} class={styles.title} />
        {content}
      </div>
    </div>
  );
}
