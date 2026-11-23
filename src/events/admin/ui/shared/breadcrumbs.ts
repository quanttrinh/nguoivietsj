// @boundary client
import { adminCatalogUrl, adminEventUrl, adminHomeUrl } from "./routes";

export interface AdminBreadcrumbLabels {
  administration: string;
  users: string;
  events: string;
  event: string;
  newEvent: string;
  editEvent: string;
  form: string;
  support: string;
  activity: string;
  checkin: string;
  qr: string;
  registration: string;
  clone: string;
  newTicketType: string;
  editTicketType: string;
}

export interface AdminBreadcrumb {
  label: string;
  href?: string | undefined;
  current?: boolean | undefined;
}

const SUBPAGE_LABELS: Record<string, keyof AdminBreadcrumbLabels> = {
  edit: "editEvent",
  form: "form",
  support: "support",
  activity: "activity",
  checkin: "checkin",
  qr: "qr",
  registration: "registration",
  clone: "clone",
  "ticket-type": "newTicketType",
};

function eventCrumb(input: {
  locale: string;
  eventId: string | null;
  eventTitle: string | null;
  labels: AdminBreadcrumbLabels;
}): AdminBreadcrumb {
  return {
    label: input.eventTitle ?? input.labels.event,
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
  const root: AdminBreadcrumb = { label: labels.administration, href: adminHomeUrl(locale) };

  if (rest.length === 0) {
    return [{ label: labels.administration, current: true }];
  }

  if (rest[0] === "users") {
    return [{ ...root }, { label: labels.users, current: true }];
  }

  if (rest[0] !== "events") {
    return [];
  }

  if (rest.length === 1) {
    return [{ ...root }, { label: labels.events, current: true }];
  }

  const events: AdminBreadcrumb = { label: labels.events, href: adminCatalogUrl(locale) };

  if (rest[1] === "new") {
    return [{ ...root }, events, { label: labels.newEvent, current: true }];
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

  let labelKey = SUBPAGE_LABELS[subpage];

  if (subpage === "ticket-type") {
    labelKey = rest[3] === "edit" ? "editTicketType" : "newTicketType";
  }

  const label = labelKey === undefined ? subpage : labels[labelKey];

  return [{ ...root }, events, event, { label, current: true }];
}
