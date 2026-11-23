import { describe, expect, test } from "vitest";

import {
  type AdminBreadcrumb,
  type AdminBreadcrumbLabels,
  resolveAdminBreadcrumbs,
} from "../../../../../../src/events/admin/ui/shared/breadcrumbs";

const labels: AdminBreadcrumbLabels = {
  administration: "Administration",
  users: "User management",
  events: "Event management",
  event: "Event",
  newEvent: "New event",
  editEvent: "Edit event",
  form: "New form version",
  support: "Support",
  activity: "Activity",
  checkin: "Check in",
  qr: "QR code",
  registration: "Registration details",
  clone: "Clone event",
  newTicketType: "New ticket type",
  editTicketType: "Edit ticket type",
};

function resolve(
  pathname: string,
  search = "",
  eventTitle: string | null = null,
): AdminBreadcrumb[] {
  return resolveAdminBreadcrumbs({
    locale: "en",
    pathname,
    search,
    labels,
    eventTitle,
  });
}

describe("admin breadcrumbs", () => {
  test("marks administration as current at the admin root", () => {
    expect(resolve("/en/admin")).toEqual([{ label: "Administration", current: true }]);
  });

  test("links users back to administration", () => {
    expect(resolve("/en/admin/users")).toEqual([
      { label: "Administration", href: "/en/admin" },
      { label: "User management", current: true },
    ]);
  });

  test("links event subpages through the event detail", () => {
    expect(
      resolve(
        "/en/admin/events/view/support",
        "?event=01a19000-0000-7000-8000-000000000002",
        "Test Event 2027",
      ),
    ).toEqual([
      { label: "Administration", href: "/en/admin" },
      { label: "Event management", href: "/en/admin/events" },
      {
        label: "Test Event 2027",
        href: "/en/admin/events/view?event=01a19000-0000-7000-8000-000000000002",
      },
      { label: "Support", current: true },
    ]);
  });

  test("labels registration detail pages", () => {
    const crumbs = resolve(
      "/en/admin/events/view/registration",
      "?event=01a19000-0000-7000-8000-000000000002&registration=01a19000-0001-7000-8000-000000000006",
      "Test Event 2027",
    );

    expect(crumbs[3]).toEqual({ label: "Registration details", current: true });
  });

  test("falls back to a generic event label before the event title loads", () => {
    const crumbs = resolve("/en/admin/events/view", "?event=01a19000-0000-7000-8000-000000000002");

    expect(crumbs[2]).toEqual({ label: "Event", current: true });
  });

  test("distinguishes ticket type create and edit labels", () => {
    const create = resolve(
      "/en/admin/events/view/ticket-type/new",
      "?event=01a19000-0000-7000-8000-000000000002",
      "Test Event 2027",
    );
    const edit = resolve(
      "/en/admin/events/view/ticket-type/edit",
      "?event=01a19000-0000-7000-8000-000000000002",
      "Test Event 2027",
    );

    expect(create[3]).toEqual({ label: "New ticket type", current: true });
    expect(edit[3]).toEqual({ label: "Edit ticket type", current: true });
  });

  test("ignores non-admin routes", () => {
    expect(resolve("/en/events")).toEqual([]);
  });
});
