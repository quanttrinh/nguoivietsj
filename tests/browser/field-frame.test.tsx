import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-preact";
import { page } from "vitest/browser";

import { FieldFrame } from "../../src/events/registration/ui/form/fields/FieldPrimitives";

describe("FieldFrame", () => {
  test("renders help and error text and keeps the control interactive", async () => {
    await render(
      <FieldFrame
        fieldRef="contact.email"
        label="Email"
        required
        help="We never share it"
        error="Enter a valid email"
      >
        <input aria-label="Email" />
      </FieldFrame>,
    );

    await expect.element(page.getByText("Email", { exact: true })).toBeVisible();
    await expect.element(page.getByText("We never share it")).toBeVisible();
    await expect.element(page.getByText("Enter a valid email")).toBeVisible();

    const input = page.getByLabelText("Email");

    await input.fill("hello@example.com");
    await expect.element(input).toHaveValue("hello@example.com");
  });
});
