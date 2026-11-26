import { Hono } from "hono";
import { describe, expect, test } from "vitest";

import { eventApiError } from "~/features/events/server/api/event-errors";
import { sharedApiError } from "~/platform/server/api/helpers/responses/shared-api-error";

type AnyErrorHelper = (
  ctx: Parameters<typeof sharedApiError>[0],
  code: string,
  options: { status: 400 | 404 },
) => Response;

function app(helper: AnyErrorHelper, code: string, status: 400 | 404) {
  return new Hono().get("/x", (ctx) => helper(ctx, code, { status }));
}

async function errorBody(response: Response): Promise<{ error: { message: string } }> {
  const body: unknown = await response.json();

  if (
    typeof body !== "object" ||
    body === null ||
    !("error" in body) ||
    typeof body.error !== "object" ||
    body.error === null ||
    !("message" in body.error) ||
    typeof body.error.message !== "string"
  ) {
    throw new Error("Expected an error envelope with a message");
  }

  return { error: { message: body.error.message } };
}

describe("locale-aware API errors", () => {
  test("shared errors follow x-locale", async () => {
    const res = await app(sharedApiError, "not_found", 404).request("/x", {
      headers: { "x-locale": "fr" },
    });
    const body = await errorBody(res);

    expect(body.error.message).toBe("Introuvable.");
    expect(res.headers.get("vary")).toContain("X-Locale");
  });

  test("event errors follow x-locale", async () => {
    const res = await app(eventApiError, "event_not_found", 404).request("/x", {
      headers: { "x-locale": "vi" },
    });
    const body = await errorBody(res);

    expect(body.error.message).toBe("Không tìm thấy sự kiện.");
  });

  test("defaults to the configured default locale", async () => {
    const res = await app(sharedApiError, "not_found", 404).request("/x");
    const body = await errorBody(res);

    expect(body.error.message).toBe("Not found.");
  });

  test("catalog gaps return a human message, not the raw code", async () => {
    const res = await app(eventApiError, "event_invalid_payload", 400).request("/x", {
      headers: { "x-locale": "fr" },
    });
    const body = await errorBody(res);

    expect(body.error.message).toBe("Certains champs sont invalides.");
  });
});
