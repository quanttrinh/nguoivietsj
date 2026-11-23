import { expect } from "vitest";

/** Parse a JSON response body; each caller asserts the shape it expects. */
export async function parseJson<TBody>(response: Response): Promise<TBody> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- API bodies are asserted at the call site.
  return (await response.json()) as TBody;
}

/** Assert a nullable lookup returned a value and narrow its type for later reads. */
export function expectRow<TValue>(row: TValue | null | undefined): TValue {
  expect(row).toBeTruthy();

  if (row == null) {
    throw new Error("Expected a value");
  }

  return row;
}
