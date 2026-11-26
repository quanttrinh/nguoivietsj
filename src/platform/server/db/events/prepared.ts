// @boundary server
/* oxlint-disable typescript/no-unsafe-type-assertion -- Cached statements are keyed by literal strings; the cast restores the concrete statement type. */
import type { EngineOrm } from "./orm";

const caches = new WeakMap<EngineOrm, Map<string, unknown>>();

/** Build a value once per ORM instance and key, then reuse it for the binding's lifetime. */
export function cached<TValue>(orm: EngineOrm, key: string, build: () => TValue): TValue {
  let cache = caches.get(orm);

  if (cache === undefined) {
    cache = new Map();
    caches.set(orm, cache);
  }

  const existing = cache.get(key);

  if (existing !== undefined) {
    return existing as TValue;
  }

  const value = build();
  cache.set(key, value);
  return value;
}
