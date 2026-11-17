// @boundary client
import type { InferResponseType } from "hono/client";

import { apiClient } from "~/shared/client/api/client";

export interface AdminEventDetailMessages {
  event: string;
  editEvent: string;
  newForm: string;
  checkIn: string;
  payments: string;
  supportLink: string;
  activity: string;
  cloneEvent: string;
  viewPublicPage: string;
  archiveEvent: string;
  archiveEventConfirm: string;
  archiveEventFailed: string;
  slug: string;
  defaultLocale: string;
  registrationCount: string;
  ticketsTotal: string;
  ticketTypes: string;
  addTicketType: string;
  status: string;
  price: string;
  minMax: string;
  capacity: string;
  remaining: string;
  edit: string;
  active: string;
  archived: string;
  formVersions: string;
  version: string;
  createdAt: string;
  preview: string;
  editForm: string;
  registrations: string;
  fullName: string;
  contact: string;
  checkedIn: string;
  notCheckedIn: string;
  qrCode: string;
  noTicketTypes: string;
  noFormVersions: string;
  noRegistrations: string;
  loading: string;
  loadFailed: string;
  forbidden: string;
  eventNotFound: string;
}
export interface Props {
  locale: string;
  messages: AdminEventDetailMessages;
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
