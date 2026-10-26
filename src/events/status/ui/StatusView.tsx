import type { ComponentChildren, JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { grid, vstack, wrap } from "styled-system/patterns";
import { localized } from "~/events/domain/localized";
import { useCachedJson } from "~/shared/client/use-cached-json";
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
  loading: string;
  linkInvalid: string;
}

interface Ticket {
  key: string;
  quantity: number;
  label: Record<string, string>;
}

interface Registration {
  id: string;
  fullName: string;
  tickets: Ticket[];
}

interface Payment {
  amountMinor: number;
  method: "cash" | "etransfer";
  note: string | null;
  updatedAt: string;
}

interface Checkin {
  checkedInAt: string;
}

interface StatusPayload {
  event: {
    slug: string;
    defaultLocale: string;
    timezone: string;
    title: Record<string, string>;
    payments: {
      etransfer: { enabled: boolean; email: string | null };
      cash: { enabled: boolean; address: string | null };
    };
  };
  registration: Registration;
  payment: Payment | null;
  checkin: Checkin | null;
  amountDue: number;
  currency: string;
  paid: boolean;
  qrSvg: string | null;
}

const styles = {
  section: vstack({ alignItems: "stretch", gap: "6", paddingBlockStart: { base: "2", md: "3" } }),
  top: vstack({ alignItems: "stretch", gap: "3" }),
  title: css({
    margin: "0",
    fontFamily: "display",
    fontSize: { base: "4xl", md: "5xl" },
    lineHeight: "none",
    letterSpacing: "tight",
    fontWeight: "bold",
  }),
  intro: css({ margin: "0", fontSize: "md", color: "onSurfaceVariant" }),
  badge: css({
    display: "inline-flex",
    width: "fit-content",
    borderRadius: "full",
    backgroundColor: "tertiaryContainer",
    color: "onTertiaryContainer",
    paddingInline: "3",
    paddingBlock: "1",
    fontSize: "sm",
    fontWeight: "semibold",
  }),
  grid: grid({ gap: "5", gridTemplateColumns: { base: "1fr", lg: "1fr 1fr" } }),
  card: vstack({ alignItems: "stretch", gap: "3" }),
  cardTitle: css({
    margin: "0",
    fontFamily: "display",
    fontSize: "xl",
    fontWeight: "bold",
    letterSpacing: "tight",
  }),
  details: css({
    margin: "0",
    borderTopWidth: "thin",
    borderTopStyle: "solid",
    borderColor: "outlineVariant",
  }),
  row: grid({
    gridTemplateColumns: { base: "1fr", sm: "minmax(0, 0.8fr) minmax(0, 1.2fr)" },
    gap: { base: "1", sm: "3" },
    paddingBlock: "3",
    borderBlockEndWidth: "thin",
    borderBlockEndStyle: "solid",
    borderColor: "outlineVariant",
  }),
  term: css({ margin: "0", fontSize: "sm", fontWeight: "semibold", color: "onSurfaceVariant" }),
  value: css({ margin: "0", fontSize: "sm", color: "onSurface", wordBreak: "break-word" }),
  qr: css({
    width: "64",
    maxWidth: "full",
    borderRadius: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    backgroundColor: "white",
    padding: "3",
    "& svg": { display: "block", width: "full", height: "auto" },
  }),
  actions: wrap({ gap: "3" }),
  link: css({
    fontSize: "sm",
    fontWeight: "semibold",
    color: "primary",
    textDecoration: "underline",
    textUnderlineOffset: "0.5",
  }),
  panel: css({
    borderRadius: "2xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    backgroundColor: "surfaceContainerLowest",
    boxShadow: "lg",
    paddingInline: { base: "5", md: "10" },
    paddingBlock: { base: "6", md: "10" },
  }),
  error: css({
    margin: "0",
    borderRadius: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "error",
    backgroundColor: "errorContainer",
    color: "onErrorContainer",
    padding: "4",
    fontSize: "sm",
  }),
  loading: css({ margin: "0", fontSize: "sm", color: "onSurfaceVariant" }),
};

function ticketSummary(registration: Registration, locale: string): string {
  return registration.tickets
    .map((ticket) => `${ticket.quantity} × ${ticket.label[locale] ?? ticket.key}`)
    .join(", ");
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
              {payload.payment.method === "cash" ? config.cash : config.etransfer}
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

export default function StatusView(props: { config: StatusViewConfig }): JSX.Element {
  const [token, setToken] = useState<string | null | undefined>();

  useEffect(() => {
    setToken(new URLSearchParams(globalThis.location.search).get("token"));
  }, []);

  const statusUrl =
    token === undefined || token === null || token.length === 0
      ? null
      : `/api/events/status/${encodeURIComponent(token)}`;
  const { data, error, loading } = useCachedJson<StatusPayload>(statusUrl);

  useEffect(() => {
    if (data === null) {
      return;
    }

    const title = localized(data.event.title, props.config.locale, "", data.event.defaultLocale);
    document.title = `${props.config.heading}: ${title}`;
  }, [data, props.config]);

  if (token === undefined || loading) {
    return <p class={styles.loading}>{props.config.loading}</p>;
  }

  if (token === null || token.length === 0 || (data === null && error !== null)) {
    return <p class={styles.error}>{props.config.linkInvalid}</p>;
  }

  if (data === null) {
    return <p class={styles.loading}>{props.config.loading}</p>;
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
