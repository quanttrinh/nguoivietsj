// @boundary server
import { lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { session, verification } from "~/db/app/schemas/auth-schema";
import { emailDeliveries } from "~/db/app/schemas/email-deliveries";

const EMAIL_DELIVERY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Prune Better Auth tables and the shared email ledger in the application database.
 *
 * Sessions and verification rows (including two-factor email codes and
 * trusted-device records) are deleted once expired.
 */
export async function runAppMaintenance(db: D1Database, now: Date = new Date()): Promise<void> {
  const orm = drizzle(db);
  const nowMs = now.getTime();
  const emailDeliveryCutoff = new Date(nowMs - EMAIL_DELIVERY_RETENTION_MS);

  await orm.batch([
    orm.delete(session).where(lte(session.expiresAt, now)),
    orm.delete(verification).where(lte(verification.expiresAt, now)),
    orm.delete(emailDeliveries).where(lte(emailDeliveries.updatedAt, emailDeliveryCutoff)),
  ]);
}
