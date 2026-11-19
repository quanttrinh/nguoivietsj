/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are asserted in tests. */
import { describe, expect } from "vitest";

import { test } from "./harness";

describe("api error surface", () => {
  test("unknown routes return the error envelope", async ({ api }) => {
    const response = await api.request("/api/does-not-exist");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ status: "error" });
  });

  test("unsupported methods return 405", async ({ api }) => {
    const response = await api.request("/api/events", { method: "PUT" });

    expect(response.status).toBe(405);
  });

  test("cross-site POST requests are rejected", async ({ api }) => {
    const response = await api.request("/api/events/status/request", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "sec-fetch-site": "cross-site",
        origin: "https://evil.example",
      },
      body: "registrationId=x&email=a@example.com",
    });

    expect(response.status).toBe(403);
  });

  test("payloads above the API limit return 413", async ({ api }) => {
    const response = await api.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "x".repeat(1024 * 1024) }),
    });

    expect(response.status).toBe(413);
  });

  test("validation errors are localized from x-locale", async ({ api }) => {
    const response = await api.request("/api/events/status/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-locale": "fr" },
      body: JSON.stringify({ registrationId: "not-a-uuid", code: "1" }),
    });
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBeTruthy();
    expect(body.error?.message?.length).toBeGreaterThan(0);
  });
});
