// @boundary client
import { useStore } from "@nanostores/preact";
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { wrap } from "styled-system/patterns";
import { localized } from "~/events/domain/localized";
import type { Locale as DeclaredLocales } from "~/shared/i18n";

import { type AdminBreadcrumbLabels, resolveAdminBreadcrumbs } from "./breadcrumbs";
import { eventTitles } from "./event-titles";

interface LocationState {
  pathname: string;
  search: string;
}

function readLocation(): LocationState {
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- location is absent during SSR.
  if (globalThis.location === undefined) {
    return { pathname: "", search: "" };
  }

  return { pathname: globalThis.location.pathname, search: globalThis.location.search };
}

function readEventId(search: string) {
  return new URLSearchParams(search).get("event");
}

const styles = {
  nav: css({ paddingBlockEnd: "3" }),
  list: wrap({ listStyle: "none", gap: "2", align: "center" }),
  item: css({ display: "inline-flex", alignItems: "center", gap: "2" }),
  link: css({
    textStyle: "body-sm-strong",
    color: "primary",
    textDecoration: "underline",
    textUnderlineOffset: "0.5",
  }),
  current: css({ textStyle: "body-sm-strong", color: "onSurfaceVariant" }),
  separator: css({ color: "onSurfaceVariant", "&::before": { content: '"/"' } }),
};

function AdminBreadcrumbs({
  locale,
  labels,
}: {
  locale: DeclaredLocales;
  labels: AdminBreadcrumbLabels;
}): JSX.Element | null {
  const [location, setLocation] = useState<LocationState>(() => readLocation());
  const titles = useStore(eventTitles);

  useEffect(() => {
    const onBeforeSwap = (event: Event) => {
      const swap = event as Event & { to?: URL };

      if (swap.to !== undefined) {
        setLocation({ pathname: swap.to.pathname, search: swap.to.search });
      }
    };
    const onPageLoad = () => {
      setLocation(readLocation());
    };

    document.addEventListener("astro:before-swap", onBeforeSwap);
    document.addEventListener("astro:page-load", onPageLoad);

    return () => {
      document.removeEventListener("astro:before-swap", onBeforeSwap);
      document.removeEventListener("astro:page-load", onPageLoad);
    };
  }, []);

  const eventId = readEventId(location.search);

  const record = eventId === null ? undefined : titles[eventId];
  const eventTitle =
    record === undefined
      ? null
      : localized(record.title, locale, record.slug, record.defaultLocale);
  const crumbs = resolveAdminBreadcrumbs({
    locale,
    pathname: location.pathname,
    search: location.search,
    labels,
    eventTitle,
  });

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <nav class={styles.nav} aria-label="Breadcrumb">
      <ol class={styles.list}>
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}:${crumb.href ?? "current"}`} class={styles.item}>
            {index > 0 ? <span class={styles.separator} aria-hidden="true" /> : null}
            {crumb.href === undefined || crumb.current === true ? (
              <span
                class={styles.current}
                aria-current={crumb.current === true ? "page" : undefined}
              >
                {crumb.label}
              </span>
            ) : (
              <a class={styles.link} href={crumb.href} data-router-link>
                {crumb.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default AdminBreadcrumbs;
