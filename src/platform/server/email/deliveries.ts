// @boundary server
import { eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { emailDeliveries } from "~/platform/server/db/app/schemas/email-deliveries";

export interface EmailDeliveryLedger {
  claim: (idempotencyKey: string, jobType: string) => Promise<boolean>;
  markSent: (idempotencyKey: string) => Promise<void>;
  markFailed: (idempotencyKey: string, error: string) => Promise<void>;
}

function createEmailDeliveryLedger(db: D1Database): EmailDeliveryLedger {
  const orm = drizzle(db);

  return {
    async claim(idempotencyKey, jobType) {
      const rows = await orm
        .insert(emailDeliveries)
        .values({
          idempotencyKey,
          jobType,
          status: "processing",
          attempts: 1,
        })
        .onConflictDoUpdate({
          target: emailDeliveries.idempotencyKey,
          set: {
            status: "processing",
            attempts: sql`${emailDeliveries.attempts} + 1`,
            lastError: null,
          },
          setWhere: ne(emailDeliveries.status, "sent"),
        })
        .returning({ idempotencyKey: emailDeliveries.idempotencyKey });

      return rows.length > 0;
    },

    async markSent(idempotencyKey) {
      await orm
        .update(emailDeliveries)
        .set({ status: "sent", lastError: null })
        .where(eq(emailDeliveries.idempotencyKey, idempotencyKey));
    },

    async markFailed(idempotencyKey, error) {
      await orm
        .update(emailDeliveries)
        .set({
          status: "failed",
          lastError: error.slice(0, 500),
        })
        .where(eq(emailDeliveries.idempotencyKey, idempotencyKey));
    },
  };
}

const ledgers = new WeakMap<D1Database, EmailDeliveryLedger>();

/** Shared email-delivery ledger for the application database. */
export function getEmailDeliveryLedger(db: D1Database): EmailDeliveryLedger {
  const existing = ledgers.get(db);

  if (existing !== undefined) {
    return existing;
  }

  const ledger = createEmailDeliveryLedger(db);
  ledgers.set(db, ledger);

  return ledger;
}
