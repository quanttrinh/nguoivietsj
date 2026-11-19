// @boundary client
import type { InferResponseType } from "hono/client";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { grid, vstack, wrap } from "styled-system/patterns";
import { localized } from "~/events/domain/localized";
import { apiClient, readApiJson } from "~/shared/client/api/client";
import { useApiQuery } from "~/shared/client/api/use-api-query";
import { guardPageStyles } from "~/shared/ui/guard-page-styles";
import { dateTimeFormatter, moneyFormatter } from "~/shared/utils/format";

export interface StatusViewConfig {
  locale: string;
  heading: string;
  intro: string;
  paymentConfirmed: string;
  paymentPending: string;
  noPaymentRequired: string;
  event: string;
  fullName: string;
  registrationId: string;
  tickets: string;
  amountDue: string;
  amountPaid: string;
  paymentMethod: string;
  paymentDate: string;
  paymentNote: string;
  cash: string;
  etransfer: string;
  other: string;
  paymentInstructions: string;
  etransferInstruction: string;
  cashInstruction: string;
  noPaymentInstructions: string;
  qrTitle: string;
  qrHelp: string;
  qrPending: string;
  checkedIn: string;
  notCheckedIn: string;
  checkedInAt: string;
  backToEvent: string;
  findAnother: string;
  linkInvalidTitle: string;
  linkInvalid: string;
}

const getStatus = apiClient.api.events.status.$get;
type StatusPayload = InferResponseType<typeof getStatus, 200>["data"];

const styles = {
  section: vstack({ alignItems: "stretch", gap: "6", paddingBlockStart: { base: "2", md: "3" } }),
  top: vstack({ alignItems: "stretch", gap: "3" }),
  title: css({
    textStyle: { base: "headline-md", md: "headline-lg" },
  }),
  intro: css({ fontSize: "md", color: "onSurfaceVariant" }),
  badge: css({
    textStyle: "body-md-strong",
    display: "inline-flex",
    w: "fit-content",
    rounded: "full",
    bgColor: "tertiaryContainer",
    color: "onTertiaryContainer",
    px: "3",
    py: "1",
  }),
  grid: grid({ gap: "5", gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" } }),
  card: vstack({ alignItems: "stretch", gap: "3" }),
  cardTitle: css({
    textStyle: "title-lg",
  }),
  details: css({
    borderBlockStartWidth: "thin",
    borderBlockStartStyle: "solid",
    borderColor: "outlineVariant",
  }),
  row: grid({
    gridTemplateColumns: { base: "1fr", sm: "minmax(0, 0.8fr) minmax(0, 1.2fr)" },
    gap: { base: "1", sm: "3" },
    py: "3",
    borderBlockEndWidth: "thin",
    borderBlockEndStyle: "solid",
    borderColor: "outlineVariant",
  }),
  term: css({
    textStyle: "body-md-strong",
    color: "onSurfaceVariant",
  }),
  value: css({ fontSize: "sm", color: "onSurface", wordBreak: "break-word" }),
  qr: css({
    w: "64",
    maxW: "full",
    rounded: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "white",
    p: "3",
    // oxlint-disable-next-line @pandacss/no-descendant-selectors -- the QR arrives as a raw <svg> string.
    "& svg": { display: "block", w: "full", h: "auto" },
  }),
  actions: wrap({ gap: "3" }),
  link: css({
    textStyle: "body-md-strong",
    color: "primary",
    textDecoration: "underline",
    textUnderlineOffset: "0.5",
  }),
  panel: css({
    rounded: "2xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerLowest",
    shadow: "lg",
    px: { base: "5", md: "10" },
    py: { base: "6", md: "10" },
  }),
};

function ticketSummary(registration: StatusPayload["registration"], locale: string): string {
  return registration.tickets
    .map((ticket) => `${ticket.quantity} × ${ticket.label[locale] ?? ticket.key}`)
    .join(", ");
}

function paymentMethodLabel(method: string, config: StatusViewConfig): string {
  if (method === "cash") {
    return config.cash;
  }

  return method === "etransfer" ? config.etransfer : config.other;
}

function DetailRow(props: { term: string; children: ComponentChildren }): JSX.Element {
  return (
    <div class={styles.row}>
      <dt class={styles.term}>{props.term}</dt>
      <dd class={styles.value}>{props.children}</dd>
    </div>
  );
}

function paymentBadgeText(payload: StatusPayload, config: StatusViewConfig): string {
  if (!payload.paid) {
    return config.paymentPending;
  }

  return payload.payment === null ? config.noPaymentRequired : config.paymentConfirmed;
}

function Details(props: {
  payload: StatusPayload;
  config: StatusViewConfig;
  dateTime: Intl.DateTimeFormat;
  money: Intl.NumberFormat;
  title: string;
}): JSX.Element {
  const payload = props.payload;
  const config = props.config;

  return (
    <div class={styles.card}>
      <h2 class={styles.cardTitle}>{config.heading}</h2>
      <dl class={styles.details}>
        <DetailRow term={config.event}>{props.title}</DetailRow>
        <DetailRow term={config.fullName}>{payload.registration.fullName}</DetailRow>
        <DetailRow term={config.registrationId}>
          <code>{payload.registration.id}</code>
        </DetailRow>
        <DetailRow term={config.tickets}>
          {ticketSummary(payload.registration, config.locale)}
        </DetailRow>
        <DetailRow term={config.amountDue}>{props.money.format(payload.amountDue / 100)}</DetailRow>
        {payload.payment === null ? null : (
          <>
            <DetailRow term={config.amountPaid}>
              {props.money.format(payload.payment.amountMinor / 100)}
            </DetailRow>
            <DetailRow term={config.paymentMethod}>
              {paymentMethodLabel(payload.payment.method, config)}
            </DetailRow>
            <DetailRow term={config.paymentDate}>
              {props.dateTime.format(new Date(payload.payment.updatedAt))}
            </DetailRow>
            {payload.payment.note !== null && payload.payment.note.length > 0 ? (
              <DetailRow term={config.paymentNote}>{payload.payment.note}</DetailRow>
            ) : null}
          </>
        )}
        <DetailRow term={config.checkedIn}>
          {payload.checkin === null
            ? config.notCheckedIn
            : `${config.checkedInAt} ${props.dateTime.format(new Date(payload.checkin.checkedInAt))}`}
        </DetailRow>
      </dl>
    </div>
  );
}

function QrPanel(props: {
  payload: StatusPayload;
  config: StatusViewConfig;
  eventUrl: string;
}): JSX.Element {
  const payload = props.payload;
  const config = props.config;
  const paidWithQr = payload.paid && payload.qrSvg !== null;

  return (
    <div class={styles.card}>
      <h2 class={styles.cardTitle}>{paidWithQr ? config.qrTitle : config.paymentInstructions}</h2>
      {paidWithQr ? (
        <>
          <div
            class={styles.qr}
            dangerouslySetInnerHTML={{
              __html: payload.qrSvg ?? "",
            }}
          />
          <p class={styles.intro}>{config.qrHelp}</p>
        </>
      ) : (
        <>
          <p class={styles.intro}>{config.qrPending}</p>
          {payload.event.payments.etransfer.enabled &&
          payload.event.payments.etransfer.email !== null ? (
            <p class={styles.value}>
              {config.etransferInstruction}{" "}
              <a class={styles.link} href={`mailto:${payload.event.payments.etransfer.email}`}>
                {payload.event.payments.etransfer.email}
              </a>
            </p>
          ) : null}
          {payload.event.payments.cash.enabled && payload.event.payments.cash.address !== null ? (
            <p class={styles.value}>
              {config.cashInstruction} {payload.event.payments.cash.address}
            </p>
          ) : null}
          {!payload.event.payments.etransfer.enabled && !payload.event.payments.cash.enabled ? (
            <p class={styles.value}>{config.noPaymentInstructions}</p>
          ) : null}
        </>
      )}
      <div class={styles.actions}>
        <a class={styles.link} href={props.eventUrl}>
          {config.backToEvent}
        </a>
        <a class={styles.link} href={`/${config.locale}/events/status`}>
          {config.findAnother}
        </a>
      </div>
    </div>
  );
}

export default function StatusView(props: { config: StatusViewConfig }): JSX.Element | null {
  const [token, setToken] = useState<string | null | undefined>();

  useEffect(() => {
    setToken(new URLSearchParams(globalThis.location.search).get("token"));
  }, []);

  const { data, error, loading } = useApiQuery(
    token == null || token.length === 0 ? null : `status:${token}`,
    token == null || token.length === 0
      ? null
      : async () => {
          const payload = await readApiJson(
            await getStatus({ header: { "x-status-token": token } }),
          );

          return payload.data;
        },
  );

  useEffect(() => {
    if (data === null) {
      return;
    }

    const title = localized(data.event.title, props.config.locale, "", data.event.defaultLocale);
    document.title = `${props.config.heading}: ${title}`;
  }, [data, props.config]);

  if (token === undefined || loading) {
    return null;
  }

  if (token === null || token.length === 0 || (data === null && error !== null)) {
    return (
      <section class={guardPageStyles.section}>
        <div class={guardPageStyles.panel} role="alert">
          <h1 class={guardPageStyles.title}>{props.config.linkInvalidTitle}</h1>
          <p class={guardPageStyles.message}>{props.config.linkInvalid}</p>
          <qui-button href={`/${props.config.locale}/events/status`} variant="filled">
            {props.config.findAnother}
          </qui-button>
        </div>
      </section>
    );
  }

  if (data === null) {
    return null;
  }

  const title = localized(data.event.title, props.config.locale, "", data.event.defaultLocale);
  const money = moneyFormatter(props.config.locale, data.currency);
  const dateTime = dateTimeFormatter(props.config.locale, data.event.timezone);
  const eventUrl = `/${props.config.locale}/events/registration?slug=${encodeURIComponent(data.event.slug)}`;

  return (
    <section class={styles.section}>
      <div class={styles.top}>
        <h1 class={styles.title}>{props.config.heading}</h1>
        <p class={styles.intro}>{props.config.intro}</p>
        <span class={styles.badge}>{paymentBadgeText(data, props.config)}</span>
      </div>
      <div class={styles.grid}>
        <div class={styles.panel}>
          <Details
            payload={data}
            config={props.config}
            money={money}
            dateTime={dateTime}
            title={title}
          />
        </div>
        <div class={styles.panel}>
          <QrPanel payload={data} config={props.config} eventUrl={eventUrl} />
        </div>
      </div>
    </section>
  );
}
