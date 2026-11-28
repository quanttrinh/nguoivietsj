// @boundary client
import type { InferResponseType } from "hono/client";
import type { JSX } from "preact";
import { useEffect } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { localized } from "~/features/events/domain/localized";
import { registrationViewStyles } from "~/features/events/registration/ui/shared/registration-overview-styles";
import {
  RegistrationAnswersCard,
  RegistrationContactsCard,
  RegistrationMetadataCard,
  RegistrationOverviewCard,
  RegistrationTicketsCard,
} from "~/features/events/registration/ui/shared/RegistrationOverviewCards";
import type { StatusViewLabels } from "~/generated/client/StatusView";
import { apiClient, readApiJson } from "~/platform/client/api/client";
import { useApiQuery } from "~/platform/client/api/use-api-query";
import type { Locale as DeclaredLocales } from "~/platform/i18n";
import { guardPageStyles } from "~/platform/ui/guard-page-styles";
import { QrImage } from "~/platform/ui/QrImage";
import { dateTimeFormatter, moneyFormatter } from "~/platform/utils/format";

interface StatusViewProps {
  locale: DeclaredLocales;
  labels: StatusViewLabels;
}

const getStatus = apiClient.api.events.status.$get;
type StatusPayload = InferResponseType<typeof getStatus, 200>["data"];

const styles = {
  section: vstack({ alignItems: "stretch", gap: "6", paddingBlockStart: { base: "2", md: "3" } }),
  top: vstack({ alignItems: "stretch", gap: "3" }),
  title: css({ textStyle: { base: "headline-md", md: "headline-lg" } }),
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
  grid: registrationViewStyles.grid,
  panel: registrationViewStyles.card,
  cardTitle: registrationViewStyles.cardTitle,
  value: registrationViewStyles.value,
  link: registrationViewStyles.link,
  actions: wrap({ gap: "3" }),
  note: registrationViewStyles.note,
  qr: css({
    w: "64",
    maxW: "full",
    rounded: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "white",
    p: "3",
    display: "block",
    h: "auto",
  }),
} as const;

function paymentBadgeText(payload: StatusPayload, labels: StatusViewLabels) {
  if (!payload.paid) {
    return labels.shared.paymentPending;
  }
  return payload.payment === null
    ? labels.shared.noPaymentRequired
    : labels.shared.paymentConfirmed;
}

function QrPanel({
  payload,
  locale,
  labels,
  eventUrl,
}: {
  payload: StatusPayload;
  locale: DeclaredLocales;
  labels: StatusViewLabels;
  eventUrl: string;
}) {
  const qrSvg = payload.paid ? payload.qrSvg : null;
  const paidWithQr = qrSvg !== null;

  return (
    <div class={styles.panel}>
      <div class={registrationViewStyles.cardHeader}>
        <h2 class={styles.cardTitle}>
          {paidWithQr
            ? labels.engineRegistrationStatus.qrTitle
            : labels.engineRegistrationStatus.paymentInstructions}
        </h2>
      </div>
      {paidWithQr ? (
        <>
          <QrImage class={styles.qr} svg={qrSvg} />
          <p class={styles.intro}>{labels.engineRegistrationStatus.qrHelp}</p>
        </>
      ) : (
        <>
          <p class={styles.intro}>{labels.engineRegistrationStatus.qrPending}</p>
          {payload.event.payments.etransfer.enabled &&
          payload.event.payments.etransfer.email !== null ? (
            <p class={styles.value}>
              {labels.engineRegistrationStatus.etransferInstruction}{" "}
              <a class={styles.link} href={`mailto:${payload.event.payments.etransfer.email}`}>
                {payload.event.payments.etransfer.email}
              </a>
            </p>
          ) : null}
          {payload.event.payments.cash.enabled && payload.event.payments.cash.address !== null ? (
            <p class={styles.value}>
              {labels.shared.payInPersonAt} {payload.event.payments.cash.address}
            </p>
          ) : null}
          {!payload.event.payments.etransfer.enabled && !payload.event.payments.cash.enabled ? (
            <p class={styles.value}>{labels.engineRegistrationStatus.noPaymentInstructions}</p>
          ) : null}
        </>
      )}
      <div class={styles.actions}>
        <a class={styles.link} href={eventUrl}>
          {labels.shared.backToEvent}
        </a>
        <a class={styles.link} href={`/${locale}/events/status`}>
          {labels.engineRegistrationStatus.findAnother}
        </a>
      </div>
    </div>
  );
}

export default function StatusView({ locale, labels }: StatusViewProps): JSX.Element | null {
  const { data, error, loading } = useApiQuery("status", async () => {
    const payload = await readApiJson(await getStatus());

    return payload.data;
  });

  useEffect(() => {
    if (data === null) {
      return;
    }

    const title = localized(data.event.title, locale, "", data.event.defaultLocale);
    document.title = `${labels.shared.yourRegistration}: ${title}`;
  }, [data, locale, labels]);

  if (loading) {
    return null;
  }

  if (data === null && error !== null) {
    return (
      <section class={guardPageStyles.section}>
        <div class={guardPageStyles.panel} role="alert">
          <h1 class={guardPageStyles.title}>{labels.engineRegistrationStatus.linkInvalidTitle}</h1>
          <p class={guardPageStyles.message}>{labels.engineRegistrationStatus.linkInvalid}</p>
          <qui-button href={`/${locale}/events/status`} variant="filled">
            {labels.engineRegistrationStatus.findAnother}
          </qui-button>
        </div>
      </section>
    );
  }

  if (data === null) {
    return null;
  }

  const title = localized(data.event.title, locale, "", data.event.defaultLocale);
  const money = moneyFormatter(locale, data.currency);
  const dateTime = dateTimeFormatter(locale, data.event.timezone);
  const eventUrl = `/${locale}/events/registration?slug=${encodeURIComponent(data.event.slug)}`;
  const { registration, payment, checkin, answerFields } = data;

  return (
    <section class={styles.section}>
      <div class={styles.top}>
        <h1 class={styles.title}>{labels.shared.yourRegistration}</h1>
        <p class={styles.intro}>{labels.engineRegistrationStatus.intro}</p>
        <span class={styles.badge}>{paymentBadgeText(data, labels)}</span>
      </div>
      <div class={styles.grid}>
        <RegistrationOverviewCard
          title={labels.shared.yourRegistration}
          eventTitle={title}
          registration={registration}
          payment={payment}
          amountDue={data.amountDue}
          paymentStatusText={paymentBadgeText(data, labels)}
          checkinStatusText={
            checkin === null
              ? labels.shared.notCheckedIn
              : `${labels.shared.checkedIn} · ${dateTime.format(new Date(checkin.checkedInAt))}`
          }
          money={money}
          dateTime={dateTime}
          labels={labels}
        />
        <QrPanel payload={data} locale={locale} labels={labels} eventUrl={eventUrl} />
      </div>
      <div class={styles.grid}>
        <RegistrationContactsCard contacts={registration.contacts} labels={labels} />
        <RegistrationTicketsCard
          tickets={registration.tickets}
          locale={locale}
          defaultLocale={data.event.defaultLocale}
          money={money}
          labels={labels}
        />
        <RegistrationAnswersCard
          answers={registration.answers}
          answerFields={answerFields}
          locale={locale}
          defaultLocale={data.event.defaultLocale}
          labels={labels}
        />
        <RegistrationMetadataCard metadata={registration.metadata} labels={labels} />
      </div>
    </section>
  );
}
