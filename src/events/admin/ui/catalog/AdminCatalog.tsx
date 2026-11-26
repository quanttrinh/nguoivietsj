// @boundary client
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack, wrap } from "styled-system/patterns";
import { can } from "~/auth/permissions";
import { adminQueries } from "~/events/admin/ui/shared/queries";
import { adminEventUrl, adminNewEventUrl } from "~/events/admin/ui/shared/routes";
import { adminPageStyles } from "~/events/admin/ui/shared/styles/admin-styles";
import { localized } from "~/events/domain/localized";
import type { AdminCatalogLabels } from "~/generated/client/AdminCatalog";
import { apiErrorMessage } from "~/shared/client/api/client";
import { useQuery } from "~/shared/client/query/use-query";
import type { Locale as DeclaredLocales } from "~/shared/i18n";
import { dateFormatter } from "~/shared/utils/format";

interface AdminCatalogProps {
  labels: AdminCatalogLabels;
  locale: DeclaredLocales;
  pageOfParts: string[];
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

export default function AdminCatalog({
  locale,
  labels,
  pageOfParts,
}: AdminCatalogProps): JSX.Element {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useQuery(adminQueries.events(page));
  const canCreate = can(data?.role, { event: ["create"] });
  const events = data?.events ?? [];
  const totalPages = data?.totalPages ?? 1;
  const title =
    data === null || canCreate ? labels.engineAdmin.title : labels.engineAdmin.staffTitle;
  const intro =
    data === null || canCreate ? labels.engineAdmin.intro : labels.engineAdmin.staffIntro;
  const [before = "", between = "", after = ""] = pageOfParts;

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
            <qui-button href={adminNewEventUrl(locale)} variant="filled">
              {labels.shared.newEvent}
            </qui-button>
          </div>
        ) : null}
      </div>

      {error !== null && !loading ? (
        <p class={styles.error} role="alert">
          {apiErrorMessage(error, labels.engineAdmin.loadFailed)}
        </p>
      ) : null}
      {!loading && error === null && events.length === 0 ? (
        <p class={adminPageStyles.empty}>{labels.engineAdmin.noEvents}</p>
      ) : null}
      {events.length > 0 ? (
        <div class={styles.list}>
          {events.map((event) => (
            <a
              key={event.id}
              class={styles.row}
              href={adminEventUrl(locale, { eventId: event.id })}
            >
              <h2 class={styles.rowTitle}>{localized(event.title, locale, event.slug)}</h2>
              <div class={styles.meta}>
                <span class={styles.badge}>{labels.shared[event.status]}</span>
                <span>{event.slug}</span>
                <span>
                  {labels.engineAdmin.registrationCount}: {event.registrationCount}
                </span>
                <span>
                  {labels.engineAdmin.ticketsTotal}: {event.ticketsTotal}
                </span>
                {event.startsAt === null ? null : (
                  <span>
                    {dateFormatter(locale, event.timezone).format(new Date(event.startsAt))}
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
              {labels.engineAdmin.previousPage}
            </button>
            <button
              type="button"
              class={styles.pagerButton}
              disabled={page >= totalPages || loading}
              onClick={() => {
                setPage((current) => Math.min(totalPages, current + 1));
              }}
            >
              {labels.engineAdmin.nextPage}
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
