// @boundary server
import { and, count, desc, eq, gt, isNull, lt, notExists, sql } from "drizzle-orm";

import { newId } from "~/platform/utils/uuid";

import { databaseSingleton, type EngineOrm } from "./orm";
import {
  registrationContacts,
  registrationStatusOtps,
  registrationStatusSessions,
  registrations,
} from "./schemas";

export interface RegistrationStatusAccess {
  registrationId: string;
  eventId: string;
  expiresAt: string;
}

export interface StatusRegistrationEmail {
  eventId: string;
  email: string;
}

export interface StatusOtp {
  id: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface CreateOtpInput {
  id: string;
  registrationId: string;
  codeHash: string;
  expiresAt: string;
  resendSince: string;
  dailySince: string;
  maxPerDay: number;
}

export interface ConsumeOtpInput {
  id: string;
  codeHash: string;
  now: string;
  maxAttempts: number;
}

export interface RegistrationStatusRepository {
  createSession: (registrationId: string, tokenHash: string, expiresAt: string) => Promise<void>;
  findByTokenHash: (tokenHash: string, now: string) => Promise<RegistrationStatusAccess | null>;
  findRegistrationEmail: (registrationId: string) => Promise<StatusRegistrationEmail | null>;
  createOtp: (input: CreateOtpInput) => Promise<boolean>;
  findLatestOtp: (registrationId: string) => Promise<StatusOtp | null>;
  incrementOtpAttempts: (id: string) => Promise<void>;
  consumeOtp: (input: ConsumeOtpInput) => Promise<boolean>;
}

/** Typed data access for registration status-page sessions. */
function createRegistrationStatusRepository(orm: EngineOrm): RegistrationStatusRepository {
  return {
    async createSession(registrationId, tokenHash, expiresAt) {
      const selection = orm
        .select({
          id: sql<string>`${newId()}`.as("id"),
          registrationId: registrations.id,
          tokenHash: sql<string>`${tokenHash}`.as("token_hash"),
          expiresAt: sql<string>`${expiresAt}`.as("expires_at"),
        })
        .from(registrations)
        .where(eq(registrations.id, registrationId));

      await orm.insert(registrationStatusSessions).select(selection);
    },

    async findRegistrationEmail(registrationId) {
      const row = await orm
        .select({
          eventId: registrations.eventId,
          email: registrationContacts.emailAddress,
        })
        .from(registrations)
        .innerJoin(registrationContacts, eq(registrationContacts.registrationId, registrations.id))
        .where(and(eq(registrations.id, registrationId), eq(registrationContacts.kind, "email")))
        .orderBy(
          desc(registrationContacts.isConfirmationMethod),
          desc(registrationContacts.isPrimary),
        )
        .limit(1)
        .get();

      if (row?.email == null) {
        return null;
      }

      return { eventId: row.eventId, email: row.email };
    },

    async createOtp(input) {
      const recentOtp = orm
        .select({ id: registrationStatusOtps.id })
        .from(registrationStatusOtps)
        .where(
          and(
            eq(registrationStatusOtps.registrationId, input.registrationId),
            gt(registrationStatusOtps.createdAt, input.resendSince),
          ),
        );
      const dailyCount = orm
        .select({ value: count() })
        .from(registrationStatusOtps)
        .where(
          and(
            eq(registrationStatusOtps.registrationId, input.registrationId),
            gt(registrationStatusOtps.createdAt, input.dailySince),
          ),
        );
      const selection = orm
        .select({
          id: sql<string>`${input.id}`.as("id"),
          registrationId: registrations.id,
          codeHash: sql<string>`${input.codeHash}`.as("code_hash"),
          expiresAt: sql<string>`${input.expiresAt}`.as("expires_at"),
        })
        .from(registrations)
        .where(
          and(
            eq(registrations.id, input.registrationId),
            notExists(recentOtp),
            lt(dailyCount, input.maxPerDay),
          ),
        );
      const inserted = await orm
        .insert(registrationStatusOtps)
        .select(selection)
        .returning({ id: registrationStatusOtps.id });

      return inserted.length === 1;
    },

    async findLatestOtp(registrationId) {
      const row = await orm
        .select()
        .from(registrationStatusOtps)
        .where(eq(registrationStatusOtps.registrationId, registrationId))
        .orderBy(desc(registrationStatusOtps.createdAt))
        .limit(1)
        .get();

      return row === undefined
        ? null
        : {
            id: row.id,
            codeHash: row.codeHash,
            attempts: row.attempts,
            expiresAt: row.expiresAt,
            consumedAt: row.consumedAt,
            createdAt: row.createdAt,
          };
    },

    async incrementOtpAttempts(id) {
      await orm
        .update(registrationStatusOtps)
        .set({ attempts: sql`${registrationStatusOtps.attempts} + 1` })
        .where(and(eq(registrationStatusOtps.id, id), isNull(registrationStatusOtps.consumedAt)));
    },

    async consumeOtp(input) {
      const consumed = await orm
        .update(registrationStatusOtps)
        .set({ consumedAt: new Date().toISOString() })
        .where(
          and(
            eq(registrationStatusOtps.id, input.id),
            eq(registrationStatusOtps.codeHash, input.codeHash),
            isNull(registrationStatusOtps.consumedAt),
            lt(registrationStatusOtps.attempts, input.maxAttempts),
            gt(registrationStatusOtps.expiresAt, input.now),
          ),
        )
        .returning({ id: registrationStatusOtps.id });

      return consumed.length > 0;
    },

    async findByTokenHash(tokenHash, now) {
      // Do not delete the token on read. The success page and the email share a
      // link, and link scanners or reloads would otherwise consume it.
      const row = await orm
        .select({
          registrationId: registrationStatusSessions.registrationId,
          expiresAt: registrationStatusSessions.expiresAt,
          eventId: registrations.eventId,
        })
        .from(registrationStatusSessions)
        .innerJoin(registrations, eq(registrations.id, registrationStatusSessions.registrationId))
        .where(
          and(
            eq(registrationStatusSessions.tokenHash, tokenHash),
            gt(registrationStatusSessions.expiresAt, now),
          ),
        )
        .limit(1)
        .get();

      return row === undefined
        ? null
        : {
            registrationId: row.registrationId,
            eventId: row.eventId,
            expiresAt: row.expiresAt,
          };
    },
  };
}

export const getRegistrationStatusRepository = databaseSingleton(
  createRegistrationStatusRepository,
);
