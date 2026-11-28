// @boundary server
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

import { drizzleLogger } from "../logger";
import { relations } from "./schemas";

export type EngineOrm = DrizzleD1Database<typeof relations>;

const engineOrms = new WeakMap<D1Database, EngineOrm>();

/** Return the shared Drizzle client for a D1 binding. */
export function getEngineOrm(db: D1Database): EngineOrm {
  let orm = engineOrms.get(db);

  if (orm === undefined) {
    orm = drizzle(db, { relations, logger: drizzleLogger });
    engineOrms.set(db, orm);
  }

  return orm;
}

/** Build one value per D1 binding, reusing it for the binding's lifetime. */
export function databaseSingleton<TRepository>(
  create: (orm: EngineOrm) => TRepository,
): (db: D1Database) => TRepository {
  const instances = new WeakMap<D1Database, TRepository>();

  return (db) => {
    const existing = instances.get(db);

    if (existing !== undefined) {
      return existing;
    }

    const instance = create(getEngineOrm(db));
    instances.set(db, instance);
    return instance;
  };
}
