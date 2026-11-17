// @boundary server
import { and, eq, exists, inArray, isNotNull, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getEngineOrm } from "~/db/events/orm";
import {
  auditEvents,
  checkins,
  emailDeliveries,
  events,
  payments,
  registrationContacts,
  registrationFieldValues,
  registrationPhoneClaims,
  registrationStatusOtps,
  registrationStatusSessions,
  registrationStats,
  registrationTickets,
  registrations,
  ticketTypeStats,
} from "~/db/events/schemas";

const OTP_RETENTION_DAYS = 30;
const EMAIL_DELIVERY_RETENTION_DAYS = 90;

/** Registration data is retained for three calendar months after the event ends. */
export const REGISTRATION_RETENTION_MONTHS = 3;

function daysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function monthsAgo(months: number, now: Date): Date {
  const result = new Date(now);
  const day = result.getUTCDate();

  // Set day to 1 first so month subtraction cannot overflow into the next month.
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);

  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(day, lastDay));

  return result;
}

/** Cutoff used to find events whose registration retention period has elapsed. */
export function registrationRetentionCutoff(now: Date = new Date()): string {
  return monthsAgo(REGISTRATION_RETENTION_MONTHS, now).toISOString();
}

/**
 * Prune expired/old status and delivery records.
 *
 * Sessions are deleted as soon as they expire; OTP rows and delivery records
 * are kept for a short debugging window and then removed. Registration data is
 * handled separately by `purgeExpiredRegistrationData`.
 */
async function pruneOperationalData(db: D1Database, now: Date = new Date()): Promise<void> {
  const orm = getEngineOrm(db);
  const nowIso = now.toISOString();
  const otpCutoff = daysAgo(OTP_RETENTION_DAYS, now);
  const deliveryCutoff = daysAgo(EMAIL_DELIVERY_RETENTION_DAYS, now);

  await orm.batch([
    orm.delete(registrationStatusSessions).where(lte(registrationStatusSessions.expiresAt, nowIso)),
    orm.delete(registrationStatusOtps).where(lte(registrationStatusOtps.createdAt, otpCutoff)),
    orm.delete(emailDeliveries).where(lte(emailDeliveries.updatedAt, deliveryCutoff)),
  ]);
}

/**
 * Delete registration data for events that ended more than three months ago.
 *
 * The purge removes registration rows and their contacts, answers, tickets,
 * check-ins, payments, phone claims, status sessions/OTPs, and
 * registration-linked audit entries. The event-level aggregate counters are
 * reset because no registrations remain. Events without an end date are left
 * alone, since the retention window cannot be determined.
 */
async function purgeExpiredRegistrationData(db: D1Database, now: Date = new Date()): Promise<void> {
  const orm = getEngineOrm(db);
  const cutoff = registrationRetentionCutoff(now);
  const hasRegistrations = exists(
    orm
      .select({ id: registrations.id })
      .from(registrations)
      .where(eq(registrations.eventId, events.id)),
  );
  const expiredEvents = await orm
    .select({ id: events.id })
    .from(events)
    .where(and(isNotNull(events.endsAt), lte(events.endsAt, cutoff), hasRegistrations))
    .all();

  if (expiredEvents.length === 0) {
    return;
  }

  const eventIds = expiredEvents.map((event) => event.id);
  const expiredRegistrationIds = orm
    .select({ id: registrations.id })
    .from(registrations)
    .where(inArray(registrations.eventId, eventIds));

  const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    orm
      .delete(auditEvents)
      .where(
        and(
          inArray(auditEvents.eventId, eventIds),
          inArray(auditEvents.targetId, expiredRegistrationIds),
        ),
      ),
    orm
      .delete(registrationStatusSessions)
      .where(inArray(registrationStatusSessions.registrationId, expiredRegistrationIds)),
    orm
      .delete(registrationStatusOtps)
      .where(inArray(registrationStatusOtps.registrationId, expiredRegistrationIds)),
    orm.delete(payments).where(inArray(payments.eventId, eventIds)),
    orm.delete(checkins).where(inArray(checkins.eventId, eventIds)),
    orm.delete(registrationFieldValues).where(inArray(registrationFieldValues.eventId, eventIds)),
    orm.delete(registrationTickets).where(inArray(registrationTickets.eventId, eventIds)),
    orm.delete(registrationPhoneClaims).where(inArray(registrationPhoneClaims.eventId, eventIds)),
    orm.delete(registrationContacts).where(inArray(registrationContacts.eventId, eventIds)),
    orm.delete(registrations).where(inArray(registrations.eventId, eventIds)),
    orm
      .update(registrationStats)
      .set({ registrationCount: 0, ticketsTotal: 0 })
      .where(inArray(registrationStats.eventId, eventIds)),
    orm
      .update(ticketTypeStats)
      .set({ ticketsSold: 0 })
      .where(inArray(ticketTypeStats.eventId, eventIds)),
  ];

  await orm.batch(statements);
}

/** Run all daily cleanup and retention work for one event-engine database. */
export async function runEventMaintenance(db: D1Database, now: Date = new Date()): Promise<void> {
  await pruneOperationalData(db, now);
  await purgeExpiredRegistrationData(db, now);
}
