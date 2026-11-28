/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are asserted in tests. */
import { describe, expect } from "vitest";

import type { TestDatabase } from "../helpers/d1";
import { test } from "./harness";

async function seededEventId(db: TestDatabase) {
  const row = await db.events.prepare("SELECT id FROM events LIMIT 1").first<{ id: string }>();

  return row?.id ?? "";
}

async function seededRegistrationId(db: TestDatabase, eventId: string) {
  const row = await db.events
    .prepare("SELECT id FROM registrations WHERE event_id = ? LIMIT 1")
    .bind(eventId)
    .first<{ id: string }>();

  return row?.id ?? "";
}

test.beforeAll(async ({ api }) => {
  await api.signIn("admin@example.com");
});

describe("admin events API", () => {
  test("lists events for an admin", async ({ api }) => {
    const response = await api.request("/api/admin/events");
    const body = (await response.json()) as {
      data?: { role?: string; events?: { id: string }[] };
    };

    expect(response.status).toBe(200);
    expect(body.data?.role).toBe("admin");
    expect(body.data?.events?.length).toBeGreaterThan(0);
  });

  test("reads an event detail", async ({ api }) => {
    const eventId = await seededEventId(api.db);
    const response = await api.request(`/api/admin/events/${eventId}`);
    const body = (await response.json()) as { data?: { event?: { id: string } } };

    expect(response.status).toBe(200);
    expect(body.data?.event?.id).toBe(eventId);
  });

  test("lists registrations for an event", async ({ api }) => {
    const eventId = await seededEventId(api.db);
    const response = await api.request(`/api/admin/events/${eventId}/registrations`);
    const body = (await response.json()) as { data?: { registrations?: { id: string }[] } };

    expect(response.status).toBe(200);
    expect(body.data?.registrations?.length).toBeGreaterThan(0);
  });

  test("returns the registration QR document", async ({ api }) => {
    const eventId = await seededEventId(api.db);
    const registrationId = await seededRegistrationId(api.db, eventId);
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/qr`,
    );
    const body = (await response.json()) as {
      data?: { registration?: { id: string }; qrAvailable?: boolean; qrSvg?: string | null };
    };

    expect(response.status).toBe(200);
    expect(body.data?.registration?.id).toBe(registrationId);
    expect(typeof body.data?.qrAvailable).toBe("boolean");
  });

  test("rejects an invalid event create payload", async ({ api }) => {
    const response = await api.request("/api/admin/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "x" }),
    });

    expect(response.status).toBe(400);
  });

  test("denies event creation to staff", async ({ api }) => {
    await api.signIn("staff@example.com");
    const response = await api.request("/api/admin/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
  });
});
