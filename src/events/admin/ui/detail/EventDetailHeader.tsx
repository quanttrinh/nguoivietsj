// @boundary client
import type { DeclaredLocales } from "intlayer";
import type { JSX } from "preact";

import { can } from "~/auth/permissions";
import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { eventStatusText } from "~/events/admin/ui/shared/status-label";
import { localized } from "~/events/domain/localized";
import { dateTimeFormatter } from "~/shared/utils/format";

import EventTitle from "../shared/EventTitle";
import { styles } from "./admin-detail-styles";
import type { AdminDetailValues, EventDetail } from "./admin-detail-types";

export function EventDetailHeader({
  locale,
  labels,
  current,
  role,
  notice,
  onArchive,
}: {
  locale: DeclaredLocales;
  labels: AdminDetailValues;
  current: EventDetail;
  role: string | null;
  notice: string | null;
  onArchive: () => void;
}): JSX.Element {
  const canCreateEvent = can(role, { event: ["create"] });
  const canEditEvent = can(role, { event: ["update"] });
  const canReadForm = can(role, { eventForm: ["read"] });
  const canReadCheckin = can(role, { eventCheckin: ["read"] });
  const canReadSupport = can(role, { eventSupport: ["read"] });
  const canReadActivity = can(role, { eventActivity: ["read"] });

  return (
    <div class={styles.topGrid}>
      <section class={`${styles.panel} ${styles.metaCard}`}>
        <EventTitle
          locale={locale}
          class={styles.title}
          fallback={localized(current.title, locale, current.slug)}
        />
        <div class={styles.metaList}>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.status}</span>
            <span class={styles.badge}>{eventStatusText(current.status, labels)}</span>
          </div>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.slug}</span>
            <span>{current.slug}</span>
          </div>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.defaultLocale}</span>
            <span>{current.defaultLocale.toUpperCase()}</span>
          </div>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.registrationCount}</span>
            <span>{current.registrationCount}</span>
          </div>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.ticketsTotal}</span>
            <span>{current.ticketsTotal}</span>
          </div>
          {current.startsAt === null ? null : (
            <div class={styles.metaRow}>
              <span class={styles.metaLabel}>{labels.eventDate}</span>
              <span>
                {dateTimeFormatter(locale, current.timezone).format(new Date(current.startsAt))}
              </span>
            </div>
          )}
        </div>
      </section>

      <section class={`${styles.panel} ${styles.actionsCard}`}>
        <h2 class={styles.cardTitle}>{labels.actions}</h2>
        <div class={styles.actions}>
          {canEditEvent ? (
            <qui-button
              href={adminEventUrl(locale, {
                view: "edit",
                eventId: current.id,
              })}
              variant="filled"
            >
              {labels.editEvent}
            </qui-button>
          ) : null}
          {canReadForm ? (
            <qui-button
              href={adminEventUrl(locale, {
                view: "form",
                eventId: current.id,
              })}
              variant="outlined"
            >
              {labels.newForm}
            </qui-button>
          ) : null}
          {canReadCheckin ? (
            <qui-button
              href={adminEventUrl(locale, {
                view: "checkin",
                eventId: current.id,
              })}
              variant="outlined"
            >
              {labels.checkIn}
            </qui-button>
          ) : null}
          {canReadSupport ? (
            <qui-button
              href={adminEventUrl(locale, {
                view: "support",
                eventId: current.id,
              })}
              variant="outlined"
            >
              {labels.supportLink}
            </qui-button>
          ) : null}
          {canReadActivity ? (
            <qui-button
              href={adminEventUrl(locale, {
                view: "activity",
                eventId: current.id,
              })}
              variant="outlined"
            >
              {labels.activity}
            </qui-button>
          ) : null}
          {canCreateEvent ? (
            <qui-button
              href={adminEventUrl(locale, {
                view: "clone",
                eventId: current.id,
              })}
              variant="outlined"
            >
              {labels.cloneEvent}
            </qui-button>
          ) : null}
          {current.enabled && (current.status === "upcoming" || current.status === "active") ? (
            <qui-button
              href={`/${locale}/events/registration?slug=${current.slug}`}
              variant="outlined"
            >
              {labels.viewPublicPage}
            </qui-button>
          ) : null}
          {canEditEvent && current.status !== "archived" ? (
            <qui-button class={styles.dangerButton} variant="text" onClick={onArchive}>
              {labels.archiveEvent}
            </qui-button>
          ) : null}
        </div>
        {notice === null ? null : (
          <p class={styles.error} role="alert">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
