// @boundary server
import { lte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { rateLimit, session, verification } from "~/db/app/schemas/auth-schema";

/** Rate-limit windows are short; an hour of history is plenty for diagnostics. */
const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000;

/**
 * Prune Better Auth tables in the application database.
 *
 * Sessions and verification rows (including two-factor email codes and
 * trusted-device records) are deleted once expired. Rate-limit counters
 * are keyed by IP and route and would otherwise accumulate forever.
 */
export async function runAppMaintenance(db: D1Database, now: Date = new Date()): Promise<void> {
  const orm = drizzle(db);
  const nowMs = now.getTime();

  await orm.batch([
    orm.delete(session).where(lte(session.expiresAt, now)),
    orm.delete(verification).where(lte(verification.expiresAt, now)),
    orm.delete(rateLimit).where(lt(rateLimit.lastRequest, nowMs - RATE_LIMIT_RETENTION_MS)),
  ]);
}
