// @boundary client
import type { InferResponseType } from "hono/client";
import type { JSX } from "preact";

import { can } from "~/auth/permissions";
import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { localized } from "~/events/domain/localized";
import type { AdminEventDetailLabels } from "~/generated/client/AdminEventDetail";
import { apiClient } from "~/shared/client/api/client";
import type { Locale as DeclaredLocales } from "~/shared/i18n";
import { dateTimeFormatter } from "~/shared/utils/format";

import EventTitle from "../shared/EventTitle";
import { styles } from "./admin-detail-styles";

const getOverview = apiClient.api.admin.events[":eventId"].overview.$get;
type EventDetail = InferResponseType<typeof getOverview, 200>["data"]["event"];

export function EventDetailHeader({
  locale,
  labels,
  current,
  role,
  notice,
  onArchive,
}: {
  locale: DeclaredLocales;
  labels: AdminEventDetailLabels;
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
            <span class={styles.metaLabel}>{labels.engineAdmin.status}</span>
            <span class={styles.badge}>{labels.shared[current.status]}</span>
          </div>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.engineAdmin.slug}</span>
            <span>{current.slug}</span>
          </div>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.engineAdmin.defaultLocale}</span>
            <span>{current.defaultLocale.toUpperCase()}</span>
          </div>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.engineAdmin.registrationCount}</span>
            <span>{current.registrationCount}</span>
          </div>
          <div class={styles.metaRow}>
            <span class={styles.metaLabel}>{labels.engineAdmin.ticketsTotal}</span>
            <span>{current.ticketsTotal}</span>
          </div>
          {current.startsAt === null ? null : (
            <div class={styles.metaRow}>
              <span class={styles.metaLabel}>{labels.engineAdmin.eventDate}</span>
              <span>
                {dateTimeFormatter(locale, current.timezone).format(new Date(current.startsAt))}
              </span>
            </div>
          )}
        </div>
      </section>

      <section class={`${styles.panel} ${styles.actionsCard}`}>
        <h2 class={styles.cardTitle}>{labels.engineAdmin.actions}</h2>
        <div class={styles.actions}>
          {canEditEvent ? (
            <qui-button
              href={adminEventUrl(locale, {
                view: "edit",
                eventId: current.id,
              })}
              variant="filled"
            >
              {labels.shared.editEvent}
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
              {labels.shared.newFormVersion}
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
              {labels.shared.checkIn}
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
              {labels.engineAdmin.supportLink}
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
              {labels.shared.activity}
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
              {labels.shared.cloneEvent}
            </qui-button>
          ) : null}
          {current.enabled && (current.status === "upcoming" || current.status === "active") ? (
            <qui-button
              href={`/${locale}/events/registration?slug=${current.slug}`}
              variant="outlined"
            >
              {labels.engineAdmin.viewPublicPage}
            </qui-button>
          ) : null}
          {canEditEvent && current.status !== "archived" ? (
            <qui-button class={styles.dangerButton} variant="text" onClick={onArchive}>
              {labels.engineAdmin.archiveEvent}
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
