// @boundary server
import { type SQLiteTable } from "drizzle-orm/sqlite-core";

import {
  auditEvents,
  checkins,
  emailDeliveries,
  eventAliases,
  eventFormVersions,
  eventSlugClaims,
  eventTicketLimits,
  eventTicketTypes,
  events,
  payments,
  registrationContacts,
  registrationFieldValues,
  registrationPhoneClaims,
  registrationStats,
  registrationStatusOtps,
  registrationStatusSessions,
  registrationTickets,
  registrations,
  ticketTypeStats,
} from "../../db/events/schemas";

/** Better-auth owns the app DB schema (`drizzle/app`); column drift is checked by drizzle-kit. */
export const APP_TABLES: SQLiteTable[] = [];

export const EVENT_TABLES: SQLiteTable[] = [
  events,
  eventAliases,
  eventSlugClaims,
  registrationStats,
  eventTicketLimits,
  eventTicketTypes,
  ticketTypeStats,
  eventFormVersions,
  registrations,
  registrationContacts,
  registrationPhoneClaims,
  registrationTickets,
  registrationFieldValues,
  checkins,
  payments,
  registrationStatusOtps,
  registrationStatusSessions,
  auditEvents,
  emailDeliveries,
];
