// @boundary shared
export function coalesceString(value: string | undefined, fallback = ""): string {
  const text = value?.trim() ?? "";

  return text.length > 0 ? text : fallback;
}
