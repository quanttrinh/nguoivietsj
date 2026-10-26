import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { newId } from "~/shared/utils/uuid";

import type { EngineOrm } from "./orm";
import {
  registrationContacts,
  registrationStatusOtps,
  registrationStatusSessions,
  registrations,
} from "./schema";

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
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export interface CreateOtpInput {
  registrationId: string;
  codeHash: string;
  expiresAt: string;
  resendSince: string;
}

export interface ConsumeOtpInput {
  id: string;
  codeHash: string;
  now: string;
  maxAttempts: number;
}

export interface RegistrationStatusRepository {
  createSession: (registrationId: string, tokenHash: string, expiresAt: string) => Promise<void>;
  hasSession: (registrationId: string, tokenHash: string, now: string) => Promise<boolean>;
  findByTokenHash: (tokenHash: string, now: string) => Promise<RegistrationStatusAccess | null>;
  findRegistrationEmail: (registrationId: string) => Promise<StatusRegistrationEmail | null>;
  createOtp: (input: CreateOtpInput) => Promise<boolean>;
  findLatestOtp: (registrationId: string) => Promise<StatusOtp | null>;
  incrementOtpAttempts: (id: string) => Promise<void>;
  consumeOtp: (input: ConsumeOtpInput) => Promise<boolean>;
}

/** Typed data access for registration status-page sessions. */
export function createRegistrationStatusRepository(orm: EngineOrm): RegistrationStatusRepository {
  return {
    async createSession(registrationId, tokenHash, expiresAt) {
      await orm.run(sql`
        INSERT INTO registration_status_sessions (id, registration_id, token_hash, expires_at)
        SELECT ${newId()}, id, ${tokenHash}, ${expiresAt}
        FROM registrations
        WHERE id = ${registrationId}
      `);
    },

    async hasSession(registrationId, tokenHash, now) {
      const row = await orm
        .select({ id: registrationStatusSessions.id })
        .from(registrationStatusSessions)
        .where(
          and(
            eq(registrationStatusSessions.registrationId, registrationId),
            eq(registrationStatusSessions.tokenHash, tokenHash),
            gt(registrationStatusSessions.expiresAt, now),
          ),
        )
        .get();

      return row !== undefined;
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
      const result = await orm.run(sql`
        INSERT INTO registration_status_otps (id, registration_id, code_hash, expires_at)
        SELECT ${newId()}, id, ${input.codeHash}, ${input.expiresAt}
        FROM registrations
        WHERE id = ${input.registrationId}
          AND NOT EXISTS (
            SELECT 1 FROM registration_status_otps
            WHERE registration_id = ${input.registrationId} AND created_at > ${input.resendSince}
          )
      `);

      return result.meta.changes === 1;
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
            code_hash: row.codeHash,
            attempts: row.attempts,
            expires_at: row.expiresAt,
            consumed_at: row.consumedAt,
            created_at: row.createdAt,
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
      const row = await orm
        .select({
          registrationId: registrationStatusSessions.registrationId,
          eventId: registrations.eventId,
          expiresAt: registrationStatusSessions.expiresAt,
        })
        .from(registrationStatusSessions)
        .innerJoin(registrations, eq(registrations.id, registrationStatusSessions.registrationId))
        .where(
          and(
            eq(registrationStatusSessions.tokenHash, tokenHash),
            gt(registrationStatusSessions.expiresAt, now),
          ),
        )
        .get();

      return row ?? null;
    },
  };
}
