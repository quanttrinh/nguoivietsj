// @boundary shared
function isPicked<TSource extends object, TKeys extends keyof TSource>(
  value: unknown,
  keys: readonly TKeys[],
): value is Pick<TSource, TKeys> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entries = Object.entries(value);

  return keys.every((key) => entries.some(([name]) => name === String(key)));
}

/** Select a subset of a plain dictionary at the page boundary. */
export function pick<TSource extends object, TKeys extends keyof TSource>(
  source: TSource,
  keys: readonly TKeys[],
): Pick<TSource, TKeys> {
  const entries = keys.map((key) => [key, source[key]] as const);
  const result: unknown = Object.fromEntries(entries);

  if (!isPicked<TSource, TKeys>(result, keys)) {
    throw new Error("pick_incomplete");
  }

  return result;
}
