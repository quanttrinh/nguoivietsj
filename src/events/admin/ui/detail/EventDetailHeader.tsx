// @boundary client
import { type JSX } from "preact";

import { can } from "~/auth/permissions";
import { adminEventUrl } from "~/events/admin/ui/shared/routes";
import { localized } from "~/events/domain/localized";

import EventTitle from "../shared/EventTitle";
import { styles } from "./admin-detail-styles";
import { type AdminEventDetailMessages, type EventDetail } from "./admin-detail-types";
import { formatDateTime } from "./admin-detail-utils";

export function EventDetailHeader(props: {
  locale: string;
  messages: AdminEventDetailMessages;
  current: EventDetail;
  role: string | null;
  notice: string | null;
  onArchive: () => void;
}): JSX.Element {
  const current = props.current;
  const notice = props.notice;
  const canCreateEvent = can(props.role, { event: ["create"] });
  const canEditEvent = can(props.role, { event: ["update"] });
  const canReadForm = can(props.role, { eventForm: ["read"] });
  const canReadCheckin = can(props.role, { eventCheckin: ["read"] });
  const canReadPayments = can(props.role, { eventPayment: ["read"] });
  const canReadSupport = can(props.role, { eventSupport: ["read"] });
  const canReadActivity = can(props.role, { eventActivity: ["read"] });

  return (
    <header class={styles.top}>
      <EventTitle
        locale={props.locale}
        class={styles.title}
        fallback={localized(current.title, props.locale, current.slug)}
      />
      <div class={styles.meta}>
        <span class={styles.badge}>{current.status}</span>
        <span>
          {props.messages.slug}: {current.slug}
        </span>
        <span>
          {props.messages.defaultLocale}: {current.defaultLocale.toUpperCase()}
        </span>
        <span>
          {props.messages.registrationCount}: {current.registrationCount}
        </span>
        <span>
          {props.messages.ticketsTotal}: {current.ticketsTotal}
        </span>
        {current.startsAt === null ? null : (
          <span>{formatDateTime(current.startsAt, props.locale, current.timezone)}</span>
        )}
      </div>
      <div class={styles.actions}>
        {canEditEvent ? (
          <qui-button
            href={adminEventUrl(props.locale, {
              view: "edit",
              eventId: current.id,
            })}
            variant="filled"
          >
            {props.messages.editEvent}
          </qui-button>
        ) : null}
        {canReadForm ? (
          <qui-button
            href={adminEventUrl(props.locale, {
              view: "form",
              eventId: current.id,
            })}
            variant="outlined"
          >
            {props.messages.newForm}
          </qui-button>
        ) : null}
        {canReadCheckin ? (
          <qui-button
            href={adminEventUrl(props.locale, {
              view: "checkin",
              eventId: current.id,
            })}
            variant="outlined"
          >
            {props.messages.checkIn}
          </qui-button>
        ) : null}
        {canReadPayments ? (
          <qui-button
            href={adminEventUrl(props.locale, {
              view: "payments",
              eventId: current.id,
            })}
            variant="outlined"
          >
            {props.messages.payments}
          </qui-button>
        ) : null}
        {canReadSupport ? (
          <qui-button
            href={adminEventUrl(props.locale, {
              view: "support",
              eventId: current.id,
            })}
            variant="outlined"
          >
            {props.messages.supportLink}
          </qui-button>
        ) : null}
        {canReadActivity ? (
          <qui-button
            href={adminEventUrl(props.locale, {
              view: "activity",
              eventId: current.id,
            })}
            variant="outlined"
          >
            {props.messages.activity}
          </qui-button>
        ) : null}
        {canCreateEvent ? (
          <qui-button
            href={adminEventUrl(props.locale, {
              view: "clone",
              eventId: current.id,
            })}
            variant="outlined"
          >
            {props.messages.cloneEvent}
          </qui-button>
        ) : null}
        {current.enabled && (current.status === "upcoming" || current.status === "active") ? (
          <qui-button
            href={`/${props.locale}/events/registration?slug=${current.slug}`}
            variant="outlined"
          >
            {props.messages.viewPublicPage}
          </qui-button>
        ) : null}
        {canEditEvent && current.status !== "archived" ? (
          <qui-button class={styles.dangerButton} variant="text" onClick={props.onArchive}>
            {props.messages.archiveEvent}
          </qui-button>
        ) : null}
      </div>
      {notice === null ? null : (
        <p class={styles.error} role="alert">
          {notice}
        </p>
      )}
    </header>
  );
}
