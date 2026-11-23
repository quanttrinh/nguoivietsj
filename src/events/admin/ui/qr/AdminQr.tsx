// @boundary client
import type { InferResponseType } from "hono/client";
import type { DeclaredLocales } from "intlayer";
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { adminQueries } from "~/events/admin/ui/shared/queries";
import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import type { AdminContentValues } from "~/events/content/admin.content";
import type { CheckinContentValues } from "~/events/content/checkin.content";
import { apiClient, apiErrorMessage } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";
import { QrImage } from "~/shared/ui/QrImage";

import EventTitle from "../shared/EventTitle";

type AdminQrLabels = Pick<AdminContentValues, "loadFailed" | "loading"> &
  Pick<
    CheckinContentValues,
    "qrTitle" | "qrHelp" | "printQr" | "openScanner" | "paymentPendingQr" | "registrationNotFound"
  >;

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
    return <p class={styles.notice}>{labels.loading}</p>;
  }

  if (params === null) {
    return <p class={styles.notice}>{labels.registrationNotFound}</p>;
  }

  if (error !== null && data === null) {
    return <p class={styles.notice}>{apiErrorMessage(error, labels.loadFailed)}</p>;
  }

  if (data === null) {
    return <p class={styles.notice}>{labels.loading}</p>;
  }

  return (
    <>
      <div class={styles.body}>
        {data.qrAvailable && data.qrSvg !== null ? (
          <>
            <p class={styles.help}>{labels.qrHelp}</p>
            <QrImage class={styles.qr} svg={data.qrSvg} />
            <p class={styles.name}>{data.registration.fullName}</p>
          </>
        ) : (
          <p class={styles.notice}>{labels.paymentPendingQr}</p>
        )}
      </div>
      <div class={styles.actions}>
        <qui-button
          variant="filled"
          onClick={() => {
            globalThis.print();
          }}
        >
          {labels.printQr}
        </qui-button>
        <qui-button
          variant="outlined"
          href={adminEventUrl(locale, {
            view: "checkin",
            eventId: params.eventId,
          })}
        >
          {labels.openScanner}
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

    document.title = `${labels.qrTitle}: ${data.registration.fullName}`;
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
