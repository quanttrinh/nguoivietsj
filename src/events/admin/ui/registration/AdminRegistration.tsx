// @boundary client
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { adminQueries } from "~/events/admin/ui/shared/queries";
import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { localized } from "~/events/domain/localized";
import { registrationPaymentStatusText } from "~/events/domain/presentation";
import {
  RegistrationAnswersCard,
  RegistrationContactsCard,
  RegistrationMetadataCard,
  RegistrationOverviewCard,
  RegistrationTicketsCard,
} from "~/events/ui/registration/RegistrationCards";
import { registrationViewStyles as styles } from "~/events/ui/registration/styles";
import type { AdminRegistrationLabels } from "~/generated/client/AdminRegistration";
import type { AllLabels } from "~/generated/client/all";
import { apiErrorMessage } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";
import type { Locale as DeclaredLocales } from "~/shared/i18n";
import { dateTimeFormatter, moneyFormatter } from "~/shared/utils/format";

import EventTitle from "../shared/EventTitle";

interface AdminRegistrationProps {
  locale: DeclaredLocales;
  labels: AdminRegistrationLabels;
}

export default function AdminRegistration({ locale, labels }: AdminRegistrationProps): JSX.Element {
  const [params, setParams] = useState<{ eventId: string; registrationId: string } | null>();

  useEffect(() => {
    const query = new URLSearchParams(globalThis.location.search);
    const eventId = query.get("event");
    const registrationId = query.get("registration");

    setParams(eventId === null || registrationId === null ? null : { eventId, registrationId });
  }, []);

  const { data, error, loading } = useQuery(
    params === null || params === undefined
      ? null
      : adminQueries.registration(params.eventId, params.registrationId),
  );
  const payload = data?.data ?? null;

  useEffect(() => {
    if (payload === null) {
      return;
    }

    const title = localized(payload.event.title, locale, "", payload.event.defaultLocale);

    document.title = `${labels.shared.registrationDetails}: ${title}`;
  }, [payload, locale, labels]);

  if (params === undefined || loading) {
    return <p class={styles.note}>{labels.engineAdmin.loading}</p>;
  }
  if (params === null) {
    return <p class={styles.error}>{labels.engineAdmin.registrationNotFound}</p>;
  }
  if (error !== null && payload === null) {
    return <p class={styles.error}>{apiErrorMessage(error, labels.engineAdmin.loadFailed)}</p>;
  }
  if (payload === null) {
    return <p class={styles.note}>{labels.engineAdmin.loading}</p>;
  }

  const { registration, payment, checkin, answerFields } = payload;
  const eventTitle = localized(payload.event.title, locale, "", payload.event.defaultLocale);
  const money = moneyFormatter(locale, payload.currency);
  const dateTime = dateTimeFormatter(locale, payload.event.timezone);

  return (
    <div class={styles.section}>
      <EventTitle
        locale={locale}
        id="engine-registration-title"
        class={css({ textStyle: { base: "headline-sm", md: "headline-md" } })}
      />
      <RegistrationOverviewCard
        title={labels.shared.registrationDetails}
        eventTitle={eventTitle}
        registration={registration}
        payment={payment}
        amountDue={payload.amountDue}
        paymentStatusText={registrationPaymentStatusText(payment, payload.amountDue, {
          paid: labels.engineAdmin.paid,
          unpaid: labels.engineAdmin.unpaid,
          noPaymentRequired: labels.shared.noPaymentRequired,
        })}
        checkinStatusText={
          checkin === null
            ? labels.shared.notCheckedIn
            : `${labels.shared.checkedIn} · ${dateTime.format(new Date(checkin.checkedInAt))}`
        }
        money={money}
        dateTime={dateTime}
        labels={labels as AllLabels}
        actions={
          <>
            <a
              class={styles.link}
              href={adminEventUrl(locale, {
                view: "qr",
                eventId: payload.event.id,
                params: new URLSearchParams({ registration: registration.id }),
              })}
            >
              {labels.shared.qRCode}
            </a>
            <a
              class={styles.link}
              href={adminEventUrl(locale, {
                view: "support",
                eventId: payload.event.id,
              })}
            >
              {labels.engineAdmin.supportLink}
            </a>
          </>
        }
      />
      <div class={styles.grid}>
        <RegistrationContactsCard contacts={registration.contacts} labels={labels as AllLabels} />
        <RegistrationTicketsCard
          tickets={registration.tickets}
          locale={locale}
          defaultLocale={payload.event.defaultLocale}
          money={money}
          labels={labels as AllLabels}
        />
        <RegistrationAnswersCard
          answers={registration.answers}
          answerFields={answerFields}
          locale={locale}
          defaultLocale={payload.event.defaultLocale}
          labels={labels as AllLabels}
        />
        <RegistrationMetadataCard metadata={registration.metadata} labels={labels as AllLabels} />
      </div>
    </div>
  );
}
