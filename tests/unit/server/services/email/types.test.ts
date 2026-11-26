import { expect, test } from "vitest";

import { EmailError } from "~/platform/server/email/types";

test("EmailError records status and retryability", () => {
  const error = new EmailError("Mailtrap quota exceeded", 429, true);

  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    name: "EmailError",
    message: "Mailtrap quota exceeded",
    status: 429,
    retryable: true,
  });
});
