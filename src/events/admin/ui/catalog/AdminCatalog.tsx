// @boundary client
import { type JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { can } from "~/auth/permissions";
import { adminQueries } from "~/events/admin/ui/shared/queries";
import { adminEventUrl, adminNewEventUrl } from "~/events/admin/ui/shared/routes";
import { adminPageStyles } from "~/events/admin/ui/shared/styles/admin-styles";
import { localized } from "~/events/domain/localized";
import { apiErrorMessage } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";
import { dateFormatter } from "~/shared/utils/format";

export interface AdminCatalogConfig {
  locale: string;
  title: string;
  intro: string;
  staffTitle: string;
  staffIntro: string;
  newEvent: string;
  noEvents: string;
  registrationCount: string;
  ticketsTotal: string;
  previousPage: string;
  nextPage: string;
  pageOfParts: string[];
  loadFailed: string;
  forbidden: string;
}

const styles = {
  list: vstack({ alignItems: "stretch", gap: "3" }),
  error: css({
    rounded: "lg",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "error",
    bgColor: "errorContainer",
    color: "onErrorContainer",
    p: "4",
    fontSize: "sm",
  }),
  row: css({
    display: "flex",
    flexDir: { base: "column", md: "row" },
    alignItems: { base: "stretch", md: "center" },
    justifyContent: "space-between",
    gap: "3",
    rounded: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerLowest",
    px: "5",
    py: "4",
    textDecoration: "none",
    color: "inherit",
    _hover: { borderColor: "primary", bgColor: "surfaceContainerLow" },
    _focusVisible: {
      ringWidth: "thick",
      outlineStyle: "solid",
      ringColor: "primary",
      ringOffset: "1",
    },
  }),
  rowTitle: css({
    textStyle: "subtitle-md",
    color: "onSurface",
  }),
  meta: wrap({
    gap: "2",
    alignItems: "center",
    justifyContent: { base: "flex-start", md: "flex-end" },
    fontSize: "sm",
    color: "onSurfaceVariant",
  }),
  badge: css({
    textStyle: "caption-strong",
    rounded: "full",
    bgColor: "surfaceContainerHigh",
    px: "2.5",
    py: "0.5",
  }),
  pager: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "3",
    paddingBlockStart: "4",
  }),
  pagerActions: css({ display: "flex", alignItems: "center", gap: "2" }),
  pagerButton: css({
    rounded: "full",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outline",
    bgColor: "surfaceContainerLowest",
    px: "4",
    py: "2",
    textStyle: "body-md-strong",
    color: "onSurface",
    cursor: "pointer",
    _disabled: { opacity: "0.5", cursor: "not-allowed" },
  }),
  pagerNote: css({ fontSize: "xs", color: "onSurfaceVariant" }),
};

export default function AdminCatalog(props: { config: AdminCatalogConfig }): JSX.Element {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useQuery(adminQueries.events(page));
  const canCreate = can(data?.role, { event: ["create"] });
  const events = data?.events ?? [];
  const totalPages = data?.totalPages ?? 1;
  const title = data === null || canCreate ? props.config.title : props.config.staffTitle;
  const intro = data === null || canCreate ? props.config.intro : props.config.staffIntro;
  const [before = "", between = "", after = ""] = props.config.pageOfParts;

  useEffect(() => {
    if (data?.role !== undefined) {
      document.title = title;
    }
  }, [data, title]);

  useEffect(() => {
    if (data !== null && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  return (
    <section class={adminPageStyles.section}>
      <div class={adminPageStyles.top}>
        <h1 class={adminPageStyles.title}>{title}</h1>
        <p class={adminPageStyles.intro}>{intro}</p>
        {canCreate ? (
          <div class={adminPageStyles.actions}>
            <qui-button href={adminNewEventUrl(props.config.locale)} variant="filled">
              {props.config.newEvent}
            </qui-button>
          </div>
        ) : null}
      </div>

      {error !== null && !loading ? (
        <p class={styles.error} role="alert">
          {apiErrorMessage(error, props.config.loadFailed)}
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
              <h2 class={styles.rowTitle}>
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
      {totalPages > 1 ? (
        <div class={styles.pager}>
          <div class={styles.pagerActions}>
            <button
              type="button"
              class={styles.pagerButton}
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              {props.config.previousPage}
            </button>
            <button
              type="button"
              class={styles.pagerButton}
              disabled={page >= totalPages || loading}
              onClick={() => {
                setPage((current) => Math.min(totalPages, current + 1));
              }}
            >
              {props.config.nextPage}
            </button>
          </div>
          <span class={styles.pagerNote}>
            {before}
            {page}
            {between}
            {totalPages}
            {after}
          </span>
        </div>
      ) : null}
    </section>
  );
}
