/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are asserted in tests. */
import { describe, expect } from "vitest";

import type { TestDatabase } from "../helpers/d1";
import { test } from "./harness";

async function firstPublishedSlug(db: TestDatabase): Promise<string> {
  const row = await db.events
    .prepare("SELECT slug FROM events WHERE enabled = 1 LIMIT 1")
    .first<{ slug: string }>();

  return row?.slug ?? "";
}

describe("public events API", () => {
  test("lists public events", async ({ api }) => {
    const response = await api.request("/api/events");
    const body = (await response.json()) as {
      data?: { events?: { slug: string }[] };
    };

    expect(response.status).toBe(200);
    expect(body.data?.events?.length).toBeGreaterThan(0);
  });

  test("returns a published event detail", async ({ api }) => {
    const slug = await firstPublishedSlug(api.db);
    const response = await api.request(`/api/events/${encodeURIComponent(slug)}`);
    const body = (await response.json()) as {
      data?: { event?: { slug: string }; form?: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.data?.event?.slug).toBe(slug);
    expect(body.data?.form).toBeTruthy();
  });

  test("returns 404 for an unknown slug", async ({ api }) => {
    const response = await api.request("/api/events/does-not-exist");

    expect(response.status).toBe(404);
  });

  test("requires a Turnstile token for registration", async ({ api }) => {
    const slug = await firstPublishedSlug(api.db);
    const response = await api.request(`/api/events/${encodeURIComponent(slug)}/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("turnstile_required");
  });

  test("rejects an invalid registration body after Turnstile", async ({ api }) => {
    const slug = await firstPublishedSlug(api.db);
    const response = await api.request(`/api/events/${encodeURIComponent(slug)}/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-turnstile-token": "test-token" },
      body: JSON.stringify({ contacts: [] }),
    });

    expect(response.status).toBe(400);
  });

  test("rate limits registration bursts", async ({ api }) => {
    const slug = await firstPublishedSlug(api.db);
    api.limiters.registration.allow = false;
    const response = await api.request(`/api/events/${encodeURIComponent(slug)}/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(429);
  });
});
