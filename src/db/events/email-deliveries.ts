import { eq, sql } from "drizzle-orm";

import type { EngineOrm } from "./orm";
import { emailDeliveries } from "./schema";

export interface EmailDeliveryRepository {
  claim: (idempotencyKey: string, jobType: string) => Promise<boolean>;
  markSent: (idempotencyKey: string) => Promise<void>;
  markFailed: (idempotencyKey: string, error: string) => Promise<void>;
}

/** Persist email idempotency keys so queue retries do not re-send completed mail. */
export function createEmailDeliveryRepository(orm: EngineOrm): EmailDeliveryRepository {
  return {
    async claim(idempotencyKey, jobType) {
      const existing = await orm
        .select({ status: emailDeliveries.status })
        .from(emailDeliveries)
        .where(eq(emailDeliveries.idempotencyKey, idempotencyKey))
        .get();

      if (existing?.status === "sent") {
        return false;
      }

      const now = new Date().toISOString();

      await orm
        .insert(emailDeliveries)
        .values({
          idempotencyKey,
          jobType,
          status: "processing",
          attempts: 1,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: emailDeliveries.idempotencyKey,
          set: {
            status: "processing",
            attempts: sql`${emailDeliveries.attempts} + 1`,
            lastError: null,
            updatedAt: now,
          },
        });

      return true;
    },

    async markSent(idempotencyKey) {
      await orm
        .update(emailDeliveries)
        .set({ status: "sent", lastError: null, updatedAt: new Date().toISOString() })
        .where(eq(emailDeliveries.idempotencyKey, idempotencyKey));
    },

    async markFailed(idempotencyKey, error) {
      await orm
        .update(emailDeliveries)
        .set({
          status: "failed",
          lastError: error.slice(0, 500),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(emailDeliveries.idempotencyKey, idempotencyKey));
    },
  };
}
