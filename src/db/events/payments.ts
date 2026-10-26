/* oxlint-disable unicorn/max-nested-calls -- Drizzle query builders are nested by design. */
import { and, desc, eq, exists, inArray, sql } from "drizzle-orm";

import { AUDIT_ACTION } from "~/events/domain/constants";
import type { PaymentMethod, PaymentRecord } from "~/events/domain/types";
import { chunk } from "~/shared/utils/chunk";
import { newId } from "~/shared/utils/uuid";

import { auditEventInsert } from "./audit";
import type { EngineOrm } from "./orm";
import { eventTicketLimits, payments, registrationTickets, registrations } from "./schema";

function toPayment(row: typeof payments.$inferSelect): PaymentRecord {
  return {
    id: row.id,
    registrationId: row.registrationId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    method: row.method,
    confirmedBy: row.confirmedBy,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface PaymentDue {
  amountMinor: number;
  currency: string;
}

export interface UpsertPaymentInput {
  eventId: string;
  registrationId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  confirmedBy: string;
  note: string | null;
}

export interface UpsertPaymentResult {
  payment: PaymentRecord;
  created: boolean;
}

export interface PaymentRepository {
  findByRegistrationId: (registrationId: string) => Promise<PaymentRecord | null>;
  findByRegistrationIds: (registrationIds: readonly string[]) => Promise<PaymentRecord[]>;
  findDue: (eventId: string, registrationId: string) => Promise<PaymentDue | null>;
  listByEvent: (eventId: string) => Promise<PaymentRecord[]>;
  upsert: (input: UpsertPaymentInput) => Promise<UpsertPaymentResult | null>;
  remove: (eventId: string, registrationId: string, actorUserId: string) => Promise<boolean>;
}

/** Typed data access for staff-confirmed payments. */
export function createPaymentRepository(orm: EngineOrm): PaymentRepository {
  async function findByRegistrationId(registrationId: string): Promise<PaymentRecord | null> {
    const row = await orm
      .select()
      .from(payments)
      .where(eq(payments.registrationId, registrationId))
      .get();

    return row === undefined ? null : toPayment(row);
  }

  return {
    findByRegistrationId,

    async findByRegistrationIds(registrationIds) {
      const ids = [...new Set(registrationIds)];
      const results = await Promise.all(
        chunk(ids, 90).map(async (group) => {
          const rows = await orm
            .select()
            .from(payments)
            .where(inArray(payments.registrationId, group))
            .all();

          return rows.map((row) => toPayment(row));
        }),
      );

      return results.flat();
    },

    async findDue(eventId, registrationId) {
      const row = await orm
        .select({
          amountMinor: sql<number>`COALESCE(SUM(${registrationTickets.quantity} * ${registrationTickets.unitPriceMinor}), 0)`,
          currency: sql<string>`COALESCE(MIN(${registrationTickets.currency}), ${eventTicketLimits.currency}, 'CAD')`,
        })
        .from(registrations)
        .leftJoin(registrationTickets, eq(registrationTickets.registrationId, registrations.id))
        .leftJoin(eventTicketLimits, eq(eventTicketLimits.eventId, registrations.eventId))
        .where(and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId)))
        .groupBy(registrations.id)
        .get();

      return row === undefined ? null : { amountMinor: row.amountMinor, currency: row.currency };
    },

    async listByEvent(eventId) {
      const rows = await orm
        .select({
          id: payments.id,
          registrationId: payments.registrationId,
          amountMinor: payments.amountMinor,
          currency: payments.currency,
          method: payments.method,
          confirmedBy: payments.confirmedBy,
          note: payments.note,
          createdAt: payments.createdAt,
          updatedAt: payments.updatedAt,
        })
        .from(payments)
        .innerJoin(registrations, eq(registrations.id, payments.registrationId))
        .where(eq(registrations.eventId, eventId))
        .orderBy(desc(payments.updatedAt), desc(payments.createdAt))
        .all();

      return rows.map((row) => toPayment(row));
    },

    async upsert(input) {
      const existing = await findByRegistrationId(input.registrationId);
      const id = existing?.id ?? newId();
      const updatedAt = new Date().toISOString();

      await orm.batch([
        orm
          .insert(payments)
          .values({
            id,
            registrationId: input.registrationId,
            amountMinor: input.amountMinor,
            currency: input.currency,
            method: input.method,
            confirmedBy: input.confirmedBy,
            note: input.note,
            updatedAt,
          })
          .onConflictDoUpdate({
            target: payments.registrationId,
            set: {
              amountMinor: input.amountMinor,
              currency: input.currency,
              method: input.method,
              confirmedBy: input.confirmedBy,
              note: input.note,
              updatedAt,
            },
          }),
        auditEventInsert(orm, {
          eventId: input.eventId,
          actorUserId: input.confirmedBy,
          action: existing === null ? AUDIT_ACTION.paymentConfirm : AUDIT_ACTION.paymentUpdate,
          targetId: input.registrationId,
          metadata: {
            amountMinor: input.amountMinor,
            currency: input.currency,
            method: input.method,
            ...(input.note === null ? {} : { note: input.note }),
          },
        }),
      ]);

      return {
        created: existing === null,
        payment: {
          id,
          registrationId: input.registrationId,
          amountMinor: input.amountMinor,
          currency: input.currency,
          method: input.method,
          confirmedBy: input.confirmedBy,
          note: input.note,
          createdAt: existing?.createdAt ?? updatedAt,
          updatedAt,
        },
      };
    },

    async remove(eventId, registrationId, actorUserId) {
      const removed = await orm
        .delete(payments)
        .where(
          and(
            eq(payments.registrationId, registrationId),
            exists(
              orm
                .select({ id: registrations.id })
                .from(registrations)
                .where(
                  and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId)),
                ),
            ),
          ),
        )
        .returning({ id: payments.id });

      if (removed.length === 0) {
        return false;
      }

      await auditEventInsert(orm, {
        eventId,
        actorUserId,
        action: AUDIT_ACTION.paymentUnconfirm,
        targetId: registrationId,
      });

      return true;
    },
  };
}
