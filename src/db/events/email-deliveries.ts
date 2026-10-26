// @boundary server
import { eq, sql } from "drizzle-orm";

import { databaseSingleton, type EngineOrm } from "./orm";
import { emailDeliveries } from "./schemas";

export interface EmailDeliveryRepository {
  claim: (idempotencyKey: string, jobType: string) => Promise<boolean>;
  markSent: (idempotencyKey: string) => Promise<void>;
  markFailed: (idempotencyKey: string, error: string) => Promise<void>;
}

/** Persist email idempotency keys so queue retries do not re-send completed mail. */
function createEmailDeliveryRepository(orm: EngineOrm): EmailDeliveryRepository {
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
          setWhere: sql`${emailDeliveries.status} <> 'sent'`,
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

export const getEmailDeliveryRepository = databaseSingleton(createEmailDeliveryRepository);
