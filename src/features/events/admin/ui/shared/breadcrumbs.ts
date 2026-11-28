// @boundary client
import type { AdminBreadcrumbsLabels as AdminBreadcrumbLabels } from "~/generated/client/AdminBreadcrumbs";

import { adminCatalogUrl, adminEventUrl, adminHomeUrl } from "./routes";

export interface AdminBreadcrumb {
  label: string;
  href?: string | undefined;
  current?: boolean | undefined;
}

function eventCrumb(input: {
  locale: string;
  eventId: string | null;
  eventTitle: string | null;
  labels: AdminBreadcrumbLabels;
}): AdminBreadcrumb {
  return {
    label: input.eventTitle ?? input.labels.shared.event,
    href:
      input.eventId === null ? undefined : adminEventUrl(input.locale, { eventId: input.eventId }),
  };
}

export function resolveAdminBreadcrumbs(input: {
  locale: string;
  pathname: string;
  search: string;
  labels: AdminBreadcrumbLabels;
  eventTitle: string | null;
}): AdminBreadcrumb[] {
  const { locale, pathname, search, labels, eventTitle } = input;
  const segments = pathname.split("/").filter((segment) => segment.length > 0);

  if (segments[0] !== locale || segments[1] !== "admin") {
    return [];
  }

  const rest = segments.slice(2);
  const root: AdminBreadcrumb = { label: labels.shared.administration, href: adminHomeUrl(locale) };

  if (rest.length === 0) {
    return [{ label: labels.shared.administration, current: true }];
  }

  if (rest[0] === "users") {
    return [{ ...root }, { label: labels.shared.userManagement, current: true }];
  }

  if (rest[0] !== "events") {
    return [];
  }

  if (rest.length === 1) {
    return [{ ...root }, { label: labels.shared.eventManagement, current: true }];
  }

  const events: AdminBreadcrumb = {
    label: labels.shared.eventManagement,
    href: adminCatalogUrl(locale),
  };

  if (rest[1] === "new") {
    return [{ ...root }, events, { label: labels.shared.newEvent, current: true }];
  }

  if (rest[1] !== "view") {
    return [{ ...root }, events];
  }

  const eventId = new URLSearchParams(search).get("event");
  const event = eventCrumb({ locale, eventId, eventTitle, labels });
  const subpage = rest[2];

  if (subpage === undefined) {
    return [{ ...root }, events, { label: event.label, current: true }];
  }

  const breadcrumbLabels: Record<string, unknown> = labels.breadcrumb;

  let label: string;
  if (subpage === "ticket-type") {
    label = labels.breadcrumb["ticket-type"][rest[3] === "edit" ? "edit" : "new"];
  } else {
    const candidate = breadcrumbLabels[subpage];

    label = typeof candidate === "string" ? candidate : subpage;
  }

  return [{ ...root }, events, event, { label, current: true }];
}

export type { AdminBreadcrumbsLabels as AdminBreadcrumbLabels } from "~/generated/client/AdminBreadcrumbs";
