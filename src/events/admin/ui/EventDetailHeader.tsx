/* oxlint-disable eslint/no-nested-ternary, unicorn/no-nested-ternary, eslint/no-negated-condition, unicorn/no-negated-condition -- Direct schema-driven rendering keeps related options together. */
import type { JSX } from "preact";

import { adminEventUrl } from "~/events/admin/islands/shared/routes";
import { localized } from "~/events/domain/localized";

import { styles } from "./admin-detail-styles";
import type { AdminEventDetailMessages, EventDetail } from "./admin-detail-types";
import { formatDateTime } from "./admin-detail-utils";

export function EventDetailHeader(props: {
  locale: string;
  messages: AdminEventDetailMessages;
  current: EventDetail;
  isAdmin: boolean;
  notice: string | null;
  onArchive: () => void;
}): JSX.Element {
  const current = props.current;
  const isAdmin = props.isAdmin;
  const notice = props.notice;

  return (
    <header class={styles.top}>
      <a class={styles.back} href={`/${props.locale}/events/admin`}>
        {props.messages.backToEvents}
      </a>
      <p class={styles.eyebrow}>{props.messages.event}</p>
      <h1 class={styles.title}>{localized(current.title, props.locale, current.slug)}</h1>
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
        {current.startsAt !== null ? (
          <span>{formatDateTime(current.startsAt, props.locale, current.timezone)}</span>
        ) : null}
      </div>
      <div class={styles.actions}>
        {isAdmin ? (
          <>
            <qui-button
              href={adminEventUrl(props.locale, {
                view: "edit",
                eventId: current.id,
              })}
              variant="filled"
            >
              {props.messages.editEvent}
            </qui-button>
            <qui-button
              href={adminEventUrl(props.locale, {
                view: "form",
                eventId: current.id,
              })}
              variant="outlined"
            >
              {props.messages.newForm}
            </qui-button>
          </>
        ) : null}
        <qui-button
          href={adminEventUrl(props.locale, {
            view: "checkin",
            eventId: current.id,
          })}
          variant="outlined"
        >
          {props.messages.checkIn}
        </qui-button>
        <qui-button
          href={adminEventUrl(props.locale, {
            view: "payments",
            eventId: current.id,
          })}
          variant="outlined"
        >
          {props.messages.payments}
        </qui-button>
        <qui-button
          href={adminEventUrl(props.locale, {
            view: "support",
            eventId: current.id,
          })}
          variant="outlined"
        >
          {props.messages.supportLink}
        </qui-button>
        <qui-button
          href={adminEventUrl(props.locale, {
            view: "activity",
            eventId: current.id,
          })}
          variant="outlined"
        >
          {props.messages.activity}
        </qui-button>
        {isAdmin ? (
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
        {isAdmin && current.status !== "archived" ? (
          <button
            class={styles.dangerButton}
            type="button"
            onClick={() => {
              props.onArchive();
            }}
          >
            {props.messages.archiveEvent}
          </button>
        ) : null}
      </div>
      {notice !== null ? (
        <p class={styles.error} role="alert">
          {notice}
        </p>
      ) : null}
    </header>
  );
}
