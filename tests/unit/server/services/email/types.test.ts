import { expect, test } from "vitest";

import { EmailError } from "../../../../../src/server/services/email/types";

test("EmailError records provider, status, and retryability", () => {
  const error = new EmailError("gmail", "gmail quota exceeded", 429, true);

  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    name: "EmailError",
    message: "gmail quota exceeded",
    provider: "gmail",
    status: 429,
    retryable: true,
  });
});
