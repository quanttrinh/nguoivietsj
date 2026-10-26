import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import * as schema from "./schema";

export type EngineOrm = DrizzleD1Database<typeof schema>;

/** Create the typed Drizzle client for one event-engine D1 binding. */
export function createEngineOrm(db: D1Database): EngineOrm {
  return drizzle(db, { schema });
}
