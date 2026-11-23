// @boundary client
import type { InferResponseType } from "hono/client";
import type { DeclaredLocales } from "intlayer";

import type { AdminContentValues } from "~/events/content/admin.content";
import { apiClient } from "~/shared/client/api/client";

/** Keys from the admin dictionary used by the event detail page and its panels. */
export const adminDetailLabelKeys = [
  "event",
  "editEvent",
  "newForm",
  "checkIn",
  "supportLink",
  "activity",
  "cloneEvent",
  "viewPublicPage",
  "archiveEvent",
  "archiveEventConfirm",
  "archiveEventFailed",
  "actions",
  "slug",
  "defaultLocale",
  "registrationCount",
  "ticketsTotal",
  "eventDate",
  "ticketTypes",
  "addTicketType",
  "status",
  "price",
  "minMax",
  "capacity",
  "remaining",
  "edit",
  "active",
  "upcoming",
  "draft",
  "archived",
  "noTicketTypes",
  "loadFailed",
  "eventNotFound",
] as const satisfies readonly (keyof AdminContentValues)[];

export type AdminDetailValues = Pick<AdminContentValues, (typeof adminDetailLabelKeys)[number]>;
export interface Props {
  locale: DeclaredLocales;
  labels: AdminDetailValues;
}
export const getOverview = apiClient.api.admin.events[":eventId"].overview.$get;
export type OverviewResponse = InferResponseType<typeof getOverview, 200>;
export type EventDetail = OverviewResponse["data"]["event"];
export type Registration = OverviewResponse["data"]["registrations"][number];
export type Checkin = OverviewResponse["data"]["checkins"][number];
export type FormVersion = OverviewResponse["data"]["formVersions"][number];
export type TicketType = EventDetail["ticketTypes"][number];
export type Contact = Registration["contacts"][number];
export type Ticket = Registration["tickets"][number];
