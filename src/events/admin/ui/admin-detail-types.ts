import type { UserRole } from "~/shared/constants/roles";

export interface AdminEventDetailMessages {
  event: string;
  backToEvents: string;
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
export interface Contact {
  id: string;
  kind: string;
  emailAddress?: string | null;
  phoneNumber?: string | null;
  city?: string | null;
  province?: string | null;
}
export interface Ticket {
  key: string;
  quantity: number;
}
export interface Registration {
  id: string;
  fullName: string;
  contacts: Contact[];
  tickets: Ticket[];
  createdAt: string;
}
export interface Checkin {
  registrationId: string;
  checkedInAt: string;
}
export interface TicketType {
  key: string;
  active: boolean;
  priceMinor: number;
  minPerRegistration: number;
  maxPerRegistration: number | null;
  capacity: number | null;
  ticketsSold: number;
}
export interface FormVersion {
  version: number;
  status: string;
  createdAt: string;
}
export interface EventDetail {
  id: string;
  slug: string;
  status: string;
  enabled: boolean;
  registrationOpen: boolean;
  defaultLocale: string;
  timezone: string;
  startsAt: string | null;
  title: Record<string, string>;
  registrationCount: number;
  ticketsTotal: number;
  limits: {
    currency: string;
  };
  ticketTypes: TicketType[];
}
export interface OverviewResponse {
  role: UserRole;
  event: EventDetail;
  registrations: Registration[];
  checkins: Checkin[];
  formVersions: FormVersion[];
}
