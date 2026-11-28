import { assert, expect } from "vitest";

import { EmailError } from "~/platform/server/email/types";

/** Assert a synchronous action threw the expected `EmailError`. */
export function expectEmailError(action: () => void, message: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error: unknown) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(EmailError);
  assert(caught instanceof EmailError);
  expect(caught).toMatchObject({ message, status: 0, retryable: false });
}
