// @boundary shared
/** Split an array into fixed-size chunks. */
export function chunk<TItem>(items: readonly TItem[], size: number): TItem[][] {
  if (size <= 0) {
    return [];
  }

  const chunks: TItem[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
