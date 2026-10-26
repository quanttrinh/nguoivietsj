import type { JSX } from "preact";
import { useEffect } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { localized } from "~/events/domain/localized";
import "~/shared/client/qui-button";
import { useCachedJson } from "~/shared/client/use-cached-json";
import { USER_ROLE, type UserRole } from "~/shared/constants/roles";
import { dateFormatter } from "~/shared/utils/format";

import { adminEventUrl } from "../islands/shared/routes";
import { adminPageStyles } from "./styles/admin-styles";

interface EventRecord {
  id: string;
  slug: string;
  status: string;
  timezone: string;
  startsAt: string | null;
  title: Record<string, string>;
  registrationCount: number;
  ticketsTotal: number;
}

interface EventsResponse {
  role?: UserRole;
  events?: EventRecord[];
}

export interface AdminCatalogConfig {
  locale: string;
  title: string;
  intro: string;
  eyebrow: string;
  staffTitle: string;
  staffIntro: string;
  newEvent: string;
  noEvents: string;
  registrationCount: string;
  ticketsTotal: string;
  loading: string;
  loadFailed: string;
  forbidden: string;
}

const styles = {
  eyebrow: css({
    margin: "0",
    fontSize: "xs",
    fontWeight: "bold",
    letterSpacing: "widest",
    textTransform: "uppercase",
    color: "onSurfaceVariant",
  }),
  list: vstack({ alignItems: "stretch", gap: "3", marginBlockStart: "6" }),
  loading: css({ margin: "0", fontSize: "sm", color: "onSurfaceVariant" }),
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
  row: css({
    display: "flex",
    flexDirection: { base: "column", md: "row" },
    alignItems: { base: "stretch", md: "center" },
    justifyContent: "space-between",
    gap: "3",
    borderRadius: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    backgroundColor: "surfaceContainerLowest",
    paddingInline: "5",
    paddingBlock: "4",
    textDecoration: "none",
    color: "inherit",
    _hover: { borderColor: "primary", backgroundColor: "surfaceContainerLow" },
    _focusVisible: {
      outlineWidth: "thick",
      outlineStyle: "solid",
      outlineColor: "primary",
      outlineOffset: "1",
    },
  }),
  rowTitle: css({
    margin: "0",
    fontSize: "md",
    fontWeight: "semibold",
    color: "onSurface",
    lineHeight: "snug",
  }),
  meta: wrap({
    gap: "2",
    alignItems: "center",
    justifyContent: { base: "flex-start", md: "flex-end" },
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
  badge: css({
    borderRadius: "full",
    backgroundColor: "surfaceContainerHigh",
    paddingInline: "2.5",
    paddingBlock: "0.5",
    fontSize: "xs",
    fontWeight: "semibold",
  }),
};

export default function AdminCatalog(props: { config: AdminCatalogConfig }): JSX.Element {
  const { data, error, loading } = useCachedJson<EventsResponse>("/api/events/admin/events");
  const isStaff = data?.role === USER_ROLE.staff;
  const isAdmin = data?.role === USER_ROLE.admin;
  const events = data?.events ?? [];
  const title = isStaff ? props.config.staffTitle : props.config.title;
  const intro = isStaff ? props.config.staffIntro : props.config.intro;

  useEffect(() => {
    if (data?.role !== undefined) {
      document.title = title;
    }
  }, [data, title]);

  return (
    <section class={adminPageStyles.section}>
      <div class={adminPageStyles.top}>
        <p class={styles.eyebrow}>{props.config.eyebrow}</p>
        <h1 class={adminPageStyles.title}>{title}</h1>
        <p class={adminPageStyles.intro}>{intro}</p>
        {isAdmin ? (
          <div class={adminPageStyles.actions}>
            <qui-button href={`/${props.config.locale}/events/admin/new`} variant="filled">
              {props.config.newEvent}
            </qui-button>
          </div>
        ) : null}
      </div>

      {loading ? <p class={styles.loading}>{props.config.loading}</p> : null}
      {error !== null && !loading ? (
        <p class={styles.error} role="alert">
          {error instanceof Error && error.message === "403"
            ? props.config.forbidden
            : props.config.loadFailed}
        </p>
      ) : null}
      {!loading && error === null && events.length === 0 ? (
        <p class={adminPageStyles.empty}>{props.config.noEvents}</p>
      ) : null}
      {events.length > 0 ? (
        <div class={styles.list}>
          {events.map((event) => (
            <a
              key={event.id}
              class={styles.row}
              href={adminEventUrl(props.config.locale, { eventId: event.id })}
            >
              <h2 class={styles.rowTitle} data-title-source>
                {localized(event.title, props.config.locale, event.slug)}
              </h2>
              <div class={styles.meta}>
                <span class={styles.badge}>{event.status}</span>
                <span>{event.slug}</span>
                <span>
                  {props.config.registrationCount}: {event.registrationCount}
                </span>
                <span>
                  {props.config.ticketsTotal}: {event.ticketsTotal}
                </span>
                {event.startsAt === null ? null : (
                  <span>
                    {dateFormatter(props.config.locale, event.timezone).format(
                      new Date(event.startsAt),
                    )}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
