// @boundary server
import type { EngineOrm } from "./orm";

/**
 * Build a prepared statement once per ORM instance and reuse it for the
 * binding's lifetime. Each call site owns a typed cache, so no cast is needed.
 */
export function statementCache<TValue>(
  build: (orm: EngineOrm) => TValue,
): (orm: EngineOrm) => TValue {
  const cache = new WeakMap<EngineOrm, TValue>();

  return (orm) => {
    let value = cache.get(orm);

    if (value === undefined) {
      value = build(orm);
      cache.set(orm, value);
    }

    return value;
  };
}
