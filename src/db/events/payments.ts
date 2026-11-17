// @boundary server
/* oxlint-disable unicorn/max-nested-calls -- Drizzle query builders are nested by design. */
import { and, eq, inArray, min, sql, sum } from "drizzle-orm";

import { AUDIT_ACTION } from "~/events/domain/constants";
import type { PaymentMethod, PaymentRecord } from "~/events/domain/types";
import { chunk } from "~/shared/utils/chunk";
import { newId } from "~/shared/utils/uuid";

import { auditEventInsert } from "./audit";
import { databaseSingleton, type EngineOrm } from "./orm";
import { payments, registrationTickets } from "./schemas";

type PaymentRow = typeof payments.$inferSelect;

function toPayment(row: PaymentRow): PaymentRecord {
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
  findDue: (registrationId: string) => Promise<PaymentDue | null>;
  upsert: (input: UpsertPaymentInput) => Promise<UpsertPaymentResult | null>;
  remove: (eventId: string, registrationId: string, actorUserId: string) => Promise<boolean>;
}

/** Typed data access for staff-confirmed payments. */
function createPaymentRepository(orm: EngineOrm): PaymentRepository {
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

      if (ids.length === 0) {
        return [];
      }

      const queries = chunk(ids, 90).map((group) =>
        orm.select().from(payments).where(inArray(payments.registrationId, group)),
      );
      const [first, ...rest] = queries;

      if (first === undefined) {
        return [];
      }

      const results = await orm.batch([first, ...rest]);

      return results.flat().map((row) => toPayment(row));
    },

    async findDue(registrationId) {
      const row = await orm
        .select({
          amountMinor: sum(
            sql<number>`${registrationTickets.quantity} * ${registrationTickets.unitPriceMinor}`,
          ),
          currency: min(registrationTickets.currency),
        })
        .from(registrationTickets)
        .where(eq(registrationTickets.registrationId, registrationId))
        .get();

      return row === undefined
        ? null
        : {
            amountMinor: Number(row.amountMinor ?? 0),
            currency: row.currency ?? "CAD",
          };
    },

    async upsert(input) {
      const existing = await findByRegistrationId(input.registrationId);
      const proposedId = newId();

      const [inserted] = (await orm.batch([
        orm
          .insert(payments)
          .values({
            id: proposedId,
            eventId: input.eventId,
            registrationId: input.registrationId,
            amountMinor: input.amountMinor,
            currency: input.currency,
            method: input.method,
            confirmedBy: input.confirmedBy,
            note: input.note,
          })
          .onConflictDoUpdate({
            target: payments.registrationId,
            set: {
              amountMinor: input.amountMinor,
              currency: input.currency,
              method: input.method,
              confirmedBy: input.confirmedBy,
              note: input.note,
            },
          })
          .returning(),
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
      ])) as [PaymentRow[], unknown];
      const row = inserted[0];

      if (row === undefined) {
        return null;
      }

      return {
        created: row.id === proposedId,
        payment: toPayment(row),
      };
    },

    async remove(eventId, registrationId, actorUserId) {
      const removed = await orm
        .delete(payments)
        .where(and(eq(payments.eventId, eventId), eq(payments.registrationId, registrationId)))
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

export const getPaymentRepository = databaseSingleton(createPaymentRepository);
