// @boundary server
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import { emailDeliveries as appEmailDeliveries } from "~/platform/server/db/app/schemas/email-deliveries";
import {
  auditEvents,
  checkins,
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
} from "~/platform/server/db/events/schemas";

/** Auth tables are owned by Better Auth; custom app tables are checked here. */
export const APP_TABLES: SQLiteTable[] = [appEmailDeliveries];

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
];
