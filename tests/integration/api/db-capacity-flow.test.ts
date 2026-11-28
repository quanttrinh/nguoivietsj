/* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-member-access -- API response bodies are asserted here. */
import { createHash } from "node:crypto";

import { describe, expect, onTestFinished } from "vitest";

import { issueStatusOtp } from "~/features/events/server/services/status";

import { getRegistrationStatusRepository } from "../../../src/platform/server/db/events";
import type { TestDatabase } from "../helpers/d1";
import { statusSessionToken } from "../helpers/status-session";
import { test, type ApiHarness } from "./harness";

const SLUG = "test-event-2027";

async function eventId(db: TestDatabase) {
  const row = await db.events
    .prepare("SELECT id FROM events WHERE slug = ?")
    .bind(SLUG)
    .first<{ id: string }>();

  expect.assert(row !== null, `expected seeded event ${SLUG}`);

  return row.id;
}

async function countRegistrations(db: TestDatabase, id: string) {
  const row = await db.events
    .prepare("SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?")
    .bind(id)
    .first<{ count: number }>();

  expect.assert(row !== null, "expected a registration count");

  return row.count;
}

async function countTickets(db: TestDatabase, id: string) {
  const row = await db.events
    .prepare("SELECT COUNT(*) AS count FROM registration_tickets WHERE event_id = ?")
    .bind(id)
    .first<{ count: number }>();

  expect.assert(row !== null, "expected a registration ticket count");

  return row.count;
}

function registrationBody(email: string, key = "general"): Record<string, unknown> {
  return {
    fullName: "Capacity Flow Person",
    contacts: [{ kind: "email", email, isConfirmation: true }],
    tickets: [{ key, quantity: 1 }],
    consent: true,
    formVersion: 1,
  };
}

function postRegistration(api: ApiHarness, email: string, key = "general"): Promise<Response> {
  return api.request(`/api/events/${SLUG}/registrations`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-turnstile-token": "test-token" },
    body: JSON.stringify(registrationBody(email, key)),
  });
}

async function errorCode(response: Response) {
  const body = (await response.json()) as { error?: { code?: string } };

  return body.error?.code;
}

async function seededRegistration(
  db: TestDatabase,
  offset = 0,
): Promise<{ registrationId: string; email: string }> {
  const row = await db.events
    .prepare("SELECT id FROM registrations ORDER BY id LIMIT 1 OFFSET ?")
    .bind(offset)
    .first<{ id: string }>();
  const contact = await db.events
    .prepare(
      "SELECT email_normalized FROM registration_contacts WHERE registration_id = ? AND kind = 'email' LIMIT 1",
    )
    .bind(row?.id ?? "")
    .first<{ email_normalized: string }>();

  return { registrationId: row?.id ?? "", email: contact?.email_normalized ?? "" };
}

function postVerify(api: ApiHarness, registrationId: string, code: string): Promise<Response> {
  return api.request("/api/events/status/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ registrationId, code }),
  });
}

function otpRow(
  db: TestDatabase,
  id: string,
): Promise<{ attempts: number; consumed_at: string | null } | null> {
  return db.events
    .prepare("SELECT attempts, consumed_at FROM registration_status_otps WHERE id = ?")
    .bind(id)
    .first<{ attempts: number; consumed_at: string | null }>();
}

async function expectWrongCode(api: ApiHarness, registrationId: string, code: string) {
  const response = await postVerify(api, registrationId, code);

  expect(response.status).toBe(400);
  expect(await errorCode(response)).toBe("event_code_invalid");
}

async function countSessions(db: TestDatabase, registrationId: string) {
  const row = await db.events
    .prepare("SELECT COUNT(*) AS count FROM registration_status_sessions WHERE registration_id = ?")
    .bind(registrationId)
    .first<{ count: number }>();

  expect.assert(row !== null, "expected a status session count");

  return row.count;
}

describe("API and D1 capacity/state flow", () => {
  test("admits exactly one registration when the committed general capacity is one", async ({
    api,
  }) => {
    const id = await eventId(api.db);
    const type = await api.db.events
      .prepare("SELECT capacity FROM event_ticket_types WHERE event_id = ? AND key = 'general'")
      .bind(id)
      .first<{ capacity: number | null }>();
    const sold = await api.db.events
      .prepare(
        "SELECT tickets_sold FROM ticket_type_stats WHERE event_id = ? AND ticket_type_key = 'general'",
      )
      .bind(id)
      .first<{ tickets_sold: number }>();

    expect.assert(type !== null, "expected the seeded general ticket type");
    expect.assert(sold !== null, "expected general ticket type stats");

    const registrationsBefore = await countRegistrations(api.db, id);
    const ticketsBefore = await countTickets(api.db, id);

    onTestFinished(async () => {
      await api.db.events
        .prepare(
          "UPDATE event_ticket_types SET capacity = ? WHERE event_id = ? AND key = 'general'",
        )
        .bind(type.capacity, id)
        .run();
      await api.db.events
        .prepare(
          "UPDATE ticket_type_stats SET tickets_sold = ? WHERE event_id = ? AND ticket_type_key = 'general'",
        )
        .bind(sold.tickets_sold, id)
        .run();
    });

    // The seed already sold one general ticket; reset the materialized counter
    // so a capacity of one admits exactly one additional ticket.
    await api.db.events
      .prepare("UPDATE event_ticket_types SET capacity = 1 WHERE event_id = ? AND key = 'general'")
      .bind(id)
      .run();
    await api.db.events
      .prepare(
        "UPDATE ticket_type_stats SET tickets_sold = 0 WHERE event_id = ? AND ticket_type_key = 'general'",
      )
      .bind(id)
      .run();

    const first = await postRegistration(api, "db-capacity-first@example.com");
    const second = await postRegistration(api, "db-capacity-second@example.com");
    const statuses = [first.status, second.status];

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status >= 400)).toHaveLength(1);

    const rejected = first.status === 201 ? second : first;

    expect(rejected.status).toBe(409);
    expect(await errorCode(rejected)).toBe("event_ticket_type_capacity_reached");
    expect(await countRegistrations(api.db, id)).toBe(registrationsBefore + 1);
    expect(await countTickets(api.db, id)).toBe(ticketsBefore + 1);
  });

  test("rejects a registration once the committed total ticket limit is reached", async ({
    api,
  }) => {
    const id = await eventId(api.db);
    const limit = await api.db.events
      .prepare("SELECT max_total_tickets FROM event_ticket_limits WHERE event_id = ?")
      .bind(id)
      .first<{ max_total_tickets: number | null }>();

    expect.assert(limit !== null, "expected seeded event ticket limits");

    const registrationsBefore = await countRegistrations(api.db, id);

    onTestFinished(async () => {
      await api.db.events
        .prepare("UPDATE event_ticket_limits SET max_total_tickets = ? WHERE event_id = ?")
        .bind(limit.max_total_tickets, id)
        .run();
    });

    await api.db.events
      .prepare("UPDATE event_ticket_limits SET max_total_tickets = ? WHERE event_id = ?")
      .bind(registrationsBefore, id)
      .run();

    const response = await postRegistration(api, "db-total-limit@example.com");

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("event_capacity_reached");
    expect(await countRegistrations(api.db, id)).toBe(registrationsBefore);
  });

  test("rejects a registration when the stored form version is a draft", async ({ api }) => {
    const id = await eventId(api.db);
    const form = await api.db.events
      .prepare("SELECT status FROM event_form_versions WHERE event_id = ? AND version = 1")
      .bind(id)
      .first<{ status: string }>();

    expect.assert(form !== null, "expected the seeded published form version");

    const registrationsBefore = await countRegistrations(api.db, id);

    onTestFinished(async () => {
      await api.db.events
        .prepare("UPDATE event_form_versions SET status = ? WHERE event_id = ? AND version = 1")
        .bind(form.status, id)
        .run();
    });

    await api.db.events
      .prepare("UPDATE event_form_versions SET status = 'draft' WHERE event_id = ? AND version = 1")
      .bind(id)
      .run();

    const response = await postRegistration(api, "db-draft-form@example.com");

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("event_invalid_form_version");
    expect(await countRegistrations(api.db, id)).toBe(registrationsBefore);
  });

  test.for(["general", "child"] as const)(
    "hides a deactivated %s ticket from detail and rejects registrations for it",
    async (key, { api }) => {
      const id = await eventId(api.db);
      const type = await api.db.events
        .prepare("SELECT active FROM event_ticket_types WHERE event_id = ? AND key = ?")
        .bind(id, key)
        .first<{ active: number }>();

      expect.assert(type !== null, "expected the seeded ticket type");

      const registrationsBefore = await countRegistrations(api.db, id);

      onTestFinished(async () => {
        await api.db.events
          .prepare("UPDATE event_ticket_types SET active = ? WHERE event_id = ? AND key = ?")
          .bind(type.active, id, key)
          .run();
      });

      await api.db.events
        .prepare("UPDATE event_ticket_types SET active = 0 WHERE event_id = ? AND key = ?")
        .bind(id, key)
        .run();

      const detail = await api.request(`/api/events/${SLUG}`);
      const detailBody = (await detail.json()) as {
        data?: { ticketTypes?: { key: string }[] };
      };
      const visibleKeys = detailBody.data?.ticketTypes?.map((ticket) => ticket.key) ?? [];

      expect(detail.status).toBe(200);
      expect(visibleKeys).not.toContain(key);
      expect(visibleKeys).toContain(key === "general" ? "child" : "general");

      const response = await postRegistration(api, `db-inactive-${key}@example.com`, key);

      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe("event_ticket_type_unavailable");
      expect(await countRegistrations(api.db, id)).toBe(registrationsBefore);
    },
  );

  test("persists failed OTP attempts in D1 before consuming a valid code", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 0);
    const issued = await issueStatusOtp(
      getRegistrationStatusRepository(api.db.events),
      registrationId,
    );

    expect(issued.ok).toBe(true);

    if (!issued.ok) {
      return;
    }

    const initial = await otpRow(api.db, issued.otp.id);

    expect.assert(initial !== null, "expected the issued OTP in D1");
    expect(initial).toMatchObject({ attempts: 0, consumed_at: null });

    const wrongCodes = ["111111", "222222", "333333"]
      .filter((code) => code !== issued.otp.code)
      .slice(0, 2);

    for (const code of wrongCodes) {
      // Each failed verification must persist its attempt before the next one reads the OTP.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await expectWrongCode(api, registrationId, code);
    }

    const afterWrong = await otpRow(api.db, issued.otp.id);

    expect.assert(afterWrong !== null, "expected the OTP row after failed attempts");
    expect(afterWrong).toMatchObject({ attempts: wrongCodes.length, consumed_at: null });

    const sessionsBefore = await countSessions(api.db, registrationId);
    const verify = await postVerify(api, registrationId, issued.otp.code);
    const body = (await verify.json()) as { data?: { ok?: boolean; token?: string } };
    const token = statusSessionToken(verify);

    expect(verify.status).toBe(200);
    expect(body.data).toEqual({ ok: true });
    expect(body.data?.token).toBeUndefined();
    expect(token).toBeTruthy();

    const consumed = await otpRow(api.db, issued.otp.id);

    expect.assert(consumed !== null, "expected the consumed OTP in D1");
    expect(consumed.consumed_at).not.toBeNull();

    expect(await countSessions(api.db, registrationId)).toBe(sessionsBefore + 1);

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await api.db.events
      .prepare("SELECT registration_id FROM registration_status_sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .first<{ registration_id: string }>();

    expect.assert(session !== null, "expected a session for the returned status token");
    expect(session).toMatchObject({ registration_id: registrationId });
  });

  test("rejects a verification when D1 marks the OTP as expired", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 6);
    const issued = await issueStatusOtp(
      getRegistrationStatusRepository(api.db.events),
      registrationId,
    );

    expect(issued.ok).toBe(true);

    if (!issued.ok) {
      return;
    }

    await api.db.events
      .prepare("UPDATE registration_status_otps SET expires_at = ? WHERE id = ?")
      .bind("2000-01-01T00:00:00.000Z", issued.otp.id)
      .run();

    const sessionsBefore = await countSessions(api.db, registrationId);
    const response = await postVerify(api, registrationId, issued.otp.code);

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("event_code_invalid");
    expect(await countSessions(api.db, registrationId)).toBe(sessionsBefore);

    const stored = await otpRow(api.db, issued.otp.id);

    expect.assert(stored !== null, "expected the expired OTP in D1");
    expect(stored).toMatchObject({ attempts: 0, consumed_at: null });
  });
});
