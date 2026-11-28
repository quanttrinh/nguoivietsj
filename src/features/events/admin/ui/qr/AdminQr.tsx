// @boundary client
import type { InferResponseType } from "hono/client";
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { adminQueries } from "~/features/events/admin/ui/shared/queries";
import { adminEventUrl } from "~/features/events/admin/ui/shared/routes";
import type { AdminQrLabels } from "~/generated/client/AdminQr";
import { apiClient, apiErrorMessage } from "~/platform/client/api/client";
import { useQuery } from "~/platform/client/query/use-query";
import type { Locale as DeclaredLocales } from "~/platform/i18n";
import { QrImage } from "~/platform/ui/QrImage";

import EventTitle from "../shared/EventTitle";

interface AdminQrProps {
  labels: AdminQrLabels;
  locale: DeclaredLocales;
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
    display: "block",
    h: "auto",
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
  locale: DeclaredLocales;
  labels: AdminQrLabels;
}

function contentFor({ params, data, error, loading, locale, labels }: ContentInput) {
  if (params === undefined || loading) {
    return <p class={styles.notice}>{labels.engineAdmin.loading}</p>;
  }

  if (params === null) {
    return <p class={styles.notice}>{labels.engineCheckin.registrationNotFound}</p>;
  }

  if (error !== null && data === null) {
    return <p class={styles.notice}>{apiErrorMessage(error, labels.engineAdmin.loadFailed)}</p>;
  }

  if (data === null) {
    return <p class={styles.notice}>{labels.engineAdmin.loading}</p>;
  }

  return (
    <>
      <div class={styles.body}>
        {data.qrAvailable && data.qrSvg !== null ? (
          <>
            <p class={styles.help}>{labels.engineCheckin.qrHelp}</p>
            <QrImage class={styles.qr} svg={data.qrSvg} />
            <p class={styles.name}>{data.registration.fullName}</p>
          </>
        ) : (
          <p class={styles.notice}>{labels.engineCheckin.paymentPendingQr}</p>
        )}
      </div>
      <div class={styles.actions}>
        <qui-button
          variant="filled"
          onClick={() => {
            globalThis.print();
          }}
        >
          {labels.engineCheckin.printQr}
        </qui-button>
        <qui-button
          variant="outlined"
          href={adminEventUrl(locale, {
            view: "checkin",
            eventId: params.eventId,
          })}
        >
          {labels.engineCheckin.openScanner}
        </qui-button>
      </div>
    </>
  );
}

export default function AdminQr({ locale, labels }: AdminQrProps): JSX.Element {
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

    document.title = `${labels.engineCheckin.qrTitle}: ${data.registration.fullName}`;
  }, [data, locale, labels]);

  const content = contentFor({
    params,
    data,
    error,
    loading,
    locale,
    labels,
  });

  return (
    <div class={styles.shell}>
      <div class={styles.card}>
        <EventTitle locale={locale} class={styles.title} />
        {content}
      </div>
    </div>
  );
}
