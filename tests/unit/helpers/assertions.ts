import { expect, vi } from "vitest";

type StandardSchema = Parameters<typeof expect.schemaMatching>[0];

/**
 * Assert that a value conforms to a Standard Schema (ArkType here) and report
 * failures at the call site rather than inside this helper.
 */
export const expectSchema = vi.defineHelper((value: unknown, schema: StandardSchema): void => {
  expect(value).toEqual(expect.schemaMatching(schema));
});
