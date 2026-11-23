/* oxlint-disable typescript/no-unsafe-type-assertion, eslint/max-lines -- API bodies are asserted in tests and route groups stay together. */
import { describe, expect, onTestFinished, vi } from "vitest";

import { getRegistrationRepository } from "../../../src/db/events";
import type { TestDatabase } from "../helpers/d1";
import { test } from "./harness";

const UNKNOWN_EVENT_ID = "01900000-0000-7000-8000-000000000000";
const UNKNOWN_REGISTRATION_ID = "01900000-0001-7000-8000-000000000001";
const MALFORMED_ID = "not-a-uuid";

interface SuccessEnvelope<TData> {
  status: "success";
  data: TData;
  meta: { warnings?: { code: string }[] };
}

interface ErrorEnvelope {
  status: "error";
  data: null;
  error: { code: string; fields?: string[] };
}

async function success<TData>(response: Response): Promise<SuccessEnvelope<TData>> {
  return (await response.json()) as SuccessEnvelope<TData>;
}

async function failure(response: Response): Promise<ErrorEnvelope> {
  return (await response.json()) as ErrorEnvelope;
}

async function seededEvent(db: TestDatabase, slug: string): Promise<{ id: string }> {
  const row = await db.events
    .prepare("SELECT id FROM events WHERE slug = ? LIMIT 1")
    .bind(slug)
    .first<{ id: string }>();
  expect.assert(row !== null, `missing seeded event: ${slug}`);

  return row;
}

async function seededRegistration(
  db: TestDatabase,
  fullName: string,
): Promise<{ eventId: string; registrationId: string }> {
  const row = await db.events
    .prepare("SELECT id, event_id FROM registrations WHERE full_name = ? LIMIT 1")
    .bind(fullName)
    .first<{ id: string; event_id: string }>();
  expect.assert(row !== null, `missing seeded registration: ${fullName}`);

  return { eventId: row.event_id, registrationId: row.id };
}

function manualBody(
  fullName: string,
  email: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    fullName,
    contacts: [{ kind: "email", email, isPrimary: true }],
    consent: true,
    ...overrides,
  };
}

function postJson(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

interface D1Like {
  prepare: (sql: string) => unknown;
  batch: (statements: unknown[]) => Promise<unknown[]>;
}

interface FakeStatement {
  bind: (...params: unknown[]) => FakeStatement;
  all: () => Promise<unknown>;
  first: () => Promise<unknown>;
  get: () => Promise<unknown>;
  raw: () => Promise<unknown>;
  run: () => Promise<unknown>;
}

function rejectingStatement(error: Error): FakeStatement {
  // oxlint-disable-next-line promise/no-promise-in-callback -- the rejection is returned to Drizzle's async statement executor.
  const failed: Promise<unknown> = Promise.reject(error);
  const statement: FakeStatement = {
    bind: () => statement,
    all: () => failed,
    first: () => failed,
    get: () => failed,
    raw: () => failed,
    run: () => failed,
  };

  return statement;
}

function proxyEngineDb(
  original: D1Like,
  override: {
    prepare?: (sql: string, real: (sql: string) => unknown) => unknown;
    batch?: (
      statements: unknown[],
      real: (statements: unknown[]) => Promise<unknown[]>,
    ) => Promise<unknown[]>;
  },
): D1Like {
  return new Proxy(original, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) =>
          override.prepare === undefined
            ? target.prepare(sql)
            : override.prepare(sql, (statement) => target.prepare(statement));
      }
      if (property === "batch") {
        return (statements: unknown[]) =>
          override.batch === undefined
            ? target.batch(statements)
            : override.batch(statements, (items) => target.batch(items));
      }

      return undefined;
    },
  });
}

const MAIL_CONFIG = {
  MAILTRAP_API_URL: "https://mailtrap.test/send",
  MAILTRAP_API_TOKEN: "test-token",
  MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED: "test-registration-template",
  MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED: "test-payment-template",
  MAILTRAP_TEMPLATE_STATUS_OTP: "test-status-otp-template",
  MAILTRAP_TEMPLATE_TWO_FACTOR_CODE: "test-two-factor-template",
} as const;

function configureMail(api: { env: Record<string, unknown> }) {
  const original = new Map<string, unknown>();

  for (const [key, value] of Object.entries(MAIL_CONFIG)) {
    original.set(key, api.env[key]);
    api.env[key] = value;
  }

  onTestFinished(() => {
    for (const [key, value] of original) {
      api.env[key] = value;
    }
  });
}

test.beforeAll(async ({ api }) => {
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

describe("admin registration list API", () => {
  test("lists seeded registrations for an event", async ({ api }) => {
    const { eventId } = await seededRegistration(api.db, "Ada Lovelace");
    const response = await api.request(`/api/admin/events/${eventId}/registrations`);
    const body = await success<{
      registrations: { id: string; fullName: string; eventId: string }[];
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data.registrations.length).toBeGreaterThan(0);
    expect(body.data.registrations.map(({ fullName }) => fullName)).toContain("Ada Lovelace");
    expect(body.data.registrations[0]).toMatchObject({ eventId });
  });

  test("caps the registration list with the limit query", async ({ api }) => {
    const { eventId } = await seededRegistration(api.db, "Ada Lovelace");
    const response = await api.request(`/api/admin/events/${eventId}/registrations?limit=1`);
    const body = await success<{ registrations: unknown[] }>(response);

    expect(response.status).toBe(200);
    expect(body.data.registrations).toHaveLength(1);
  });

  test.for([
    { label: "zero", query: "?limit=0" },
    { label: "above maximum", query: "?limit=101" },
    { label: "non-integer", query: "?limit=many" },
  ])("rejects an invalid registration limit ($label)", async ({ query }, { api }) => {
    const { eventId } = await seededRegistration(api.db, "Ada Lovelace");
    const response = await api.request(`/api/admin/events/${eventId}/registrations${query}`);
    const body = await failure(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 404 when listing registrations of an unknown event", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${UNKNOWN_EVENT_ID}/registrations`);
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_not_found");
  });

  test("rejects a malformed event id when listing registrations", async ({ api }) => {
    const response = await api.request(`/api/admin/events/${MALFORMED_ID}/registrations`);

    expect(response.status).toBe(400);
  });
});

describe("admin manual registration API", () => {
  test("creates a manual registration and warns when email is not queued", async ({ api }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson(
        manualBody("Manual Tester", "manual.tester@example.com", {
          tickets: [{ key: "child", quantity: 1 }],
        }),
      ),
    );
    const body = await success<{
      registration: { id: string; statusUrl: string; amountMinor: number };
      emailQueued: boolean;
    }>(response);

    expect(response.status).toBe(201);
    expect(body.data.registration).toMatchObject({
      amountMinor: 800,
      statusUrl: expect.stringContaining("/api/events/status/link") as string,
    });
    expect(body.data.emailQueued).toBe(false);
    expect(body.meta.warnings?.[0]?.code).toBe("event_registration_email_not_queued");

    const stored = await api.db.events
      .prepare("SELECT manual FROM registrations WHERE id = ?")
      .bind(body.data.registration.id)
      .first<{ manual: number }>();
    expect.assert(stored !== null);
    expect(stored.manual).toBe(1);
  });

  test("reports emailQueued when the mail transport is configured", async ({ api }) => {
    const { id: eventId } = await seededEvent(api.db, "test-event-2027");

    configureMail(api);
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson(
        manualBody("Manual Queued", "manual.queued@example.com", {
          tickets: [{ key: "general", quantity: 1 }],
        }),
      ),
    );
    const body = await success<{ emailQueued: boolean }>(response);

    expect(response.status).toBe(201);
    expect(body.data.emailQueued).toBe(true);
    expect(body.meta.warnings).toBeUndefined();
  });

  test.for([
    {
      name: "a blank full name",
      body: { fullName: "   " },
      fields: ["fullName"],
    },
    {
      name: "an unknown ticket key",
      body: { fullName: "Bad Ticket", tickets: [{ key: "bogus", quantity: 1 }] },
      fields: ["tickets"],
    },
    {
      name: "answers without a form version",
      body: { fullName: "No Version", answers: { company: "Acme" } },
      fields: ["answers"],
    },
  ])("rejects a manual registration with ($name)", async ({ body: payload, fields }, { api }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson(payload),
    );
    const body = await failure(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "event_invalid_payload", fields });
  });

  test("rejects two mail contacts with an invalid-payload error", async ({ api }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson({
        fullName: "Two Mail Contacts",
        consent: true,
        contacts: [
          {
            kind: "mail",
            addressLine1: "1 First Street",
            city: "Toronto",
            province: "ON",
            postalCode: "M5V1A1",
            isPrimary: true,
          },
          {
            kind: "mail",
            addressLine1: "2 Second Street",
            city: "Toronto",
            province: "ON",
            postalCode: "M5V1A2",
          },
        ],
      }),
    );
    const body = await failure(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("event_invalid_payload");
    expect(body.error.fields).toContain("contacts");
  });

  test("rejects phone contacts that normalize to the same number", async ({ api }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson({
        fullName: "Duplicate Phones",
        consent: true,
        contacts: [
          { kind: "phone", phone: "416-555-1234", isPrimary: true },
          { kind: "phone", phone: "(416) 555-1234" },
        ],
      }),
    );
    const body = await failure(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("event_invalid_payload");
    expect(body.error.fields).toContain("contacts");
  });

  test("accepts distinct phone contacts", async ({ api }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson({
        fullName: "Two Phones",
        consent: true,
        contacts: [
          { kind: "phone", phone: "416-555-1234", isPrimary: true },
          { kind: "phone", phone: "416-555-5678" },
        ],
        tickets: [{ key: "child", quantity: 1 }],
      }),
    );

    expect(response.status).toBe(201);
  });

  test("does not let a manual registration's email block a public registration", async ({
    api,
  }) => {
    const { id: eventId } = await seededEvent(api.db, "test-event-2027");
    const email = "manual-then-public@example.com";

    const manualResponse = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson({
        fullName: "Manual First",
        contacts: [{ kind: "email", email, isPrimary: true }],
        consent: true,
        tickets: [{ key: "general", quantity: 1 }],
      }),
    );
    expect(manualResponse.status).toBe(201);

    const publicResponse = await api.request("/api/events/test-event-2027/registrations", {
      method: "POST",
      headers: { "content-type": "application/json", "x-turnstile-token": "test-token" },
      body: JSON.stringify({
        fullName: "Public Second",
        contacts: [{ kind: "email", email, isConfirmation: true }],
        tickets: [{ key: "general", quantity: 1 }],
        consent: true,
        formVersion: 1,
      }),
    });
    const publicBody = (await publicResponse.json()) as {
      status?: string;
      data?: { registration?: { id?: string } };
      error?: { code?: string } | null;
    };

    expect(publicResponse.status).toBe(201);
    expect(publicBody.status).toBe("success");
    expect(publicBody.error).toBeNull();
    expect(publicBody.data?.registration?.id).toBeTruthy();

    const stored = await api.db.events
      .prepare(
        "SELECT r.id, r.manual FROM registrations r JOIN registration_contacts c ON c.registration_id = r.id WHERE c.email_normalized = ?",
      )
      .bind(email)
      .all<{ id: string; manual: number }>();
    expect(stored.results).toHaveLength(2);
    expect(new Set(stored.results.map((row) => row.id)).size).toBe(2);
    expect(new Set(stored.results.map((row) => row.manual))).toEqual(new Set([0, 1]));
  });

  test.for([
    { label: "empty", body: {} },
    { label: "blank name", body: { fullName: "" } },
    { label: "invalid tickets", body: { fullName: "Valid Name", tickets: "bad" } },
  ])("rejects a malformed manual registration payload ($label)", async ({ body }, { api }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson(body),
    );
    const error = await failure(response);

    expect(response.status).toBe(400);
    expect(error.error.code).toBe("bad_request");
  });

  test("propagates an unexpected error during manual registration", async ({ api }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    const digest = vi
      .spyOn(crypto.subtle, "digest")
      .mockImplementation((algorithm, data) =>
        data instanceof Uint8Array && data.byteLength === 43
          ? Promise.reject(new Error("status token hashing unavailable"))
          : originalDigest(algorithm, data),
      );

    try {
      const response = await api.request(
        `/api/admin/events/${eventId}/registrations/manual`,
        postJson(manualBody("Crypto Failure", "crypto.failure@example.com")),
      );

      expect(response.status).toBe(500);
    } finally {
      digest.mockRestore();
    }
  });

  test("returns 404 when creating a manual registration for an unknown event", async ({ api }) => {
    const response = await api.request(
      `/api/admin/events/${UNKNOWN_EVENT_ID}/registrations/manual`,
      postJson(manualBody("Orphan Manual", "orphan.manual@example.com")),
    );
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_not_found");
  });
});

describe("admin check-in API", () => {
  test("rejects check-in while payment is outstanding", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Dorothy Vaughan");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`,
      { method: "POST" },
    );
    const body = await failure(response);

    expect(response.status).toBe(402);
    expect(body.error.code).toBe("event_payment_required");
  });

  test("checks in a paid registration and then removes the check-in", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Grace Hopper");
    const checkinPath = `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`;

    const checkinResponse = await api.request(checkinPath, { method: "POST" });
    const checkinBody = await success<{
      registration: { id: string };
      checkin: { id: string; registrationId: string };
      alreadyCheckedIn: boolean;
    }>(checkinResponse);

    expect(checkinResponse.status).toBe(201);
    expect(checkinBody.data).toMatchObject({
      registration: { id: registrationId },
      checkin: { registrationId },
      alreadyCheckedIn: false,
    });

    const removeResponse = await api.request(checkinPath, { method: "DELETE" });
    const removeBody = await success<{ removed: boolean }>(removeResponse);

    expect(removeResponse.status).toBe(200);
    expect(removeBody.data).toEqual({ removed: true });

    const stored = await api.db.events
      .prepare("SELECT id FROM checkins WHERE registration_id = ?")
      .bind(registrationId)
      .first<{ id: string }>();
    expect(stored).toBeNull();
  });

  test("reports a failed check-in when the database rejects the insert", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Grace Hopper");
    const original = api.env.EVENT_ENGINE_DB as D1Like;
    const proxy = proxyEngineDb(original, {
      prepare: (sql, real) =>
        sql.includes('insert into "checkins"')
          ? rejectingStatement(new Error("FOREIGN KEY constraint failed"))
          : real(sql),
    });

    try {
      api.env.EVENT_ENGINE_DB = proxy;
      const response = await api.request(
        `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`,
        { method: "POST" },
      );
      const body = await failure(response);

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("event_checkin_failed");
    } finally {
      api.env.EVENT_ENGINE_DB = original;
    }
  });

  test("reports an existing check-in without creating a duplicate", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Ada Lovelace");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`,
      { method: "POST" },
    );
    const body = await success<{
      checkin: { checkedInAt: string };
      alreadyCheckedIn: boolean;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data.alreadyCheckedIn).toBe(true);
    expect(body.data.checkin.checkedInAt).toBe("2026-10-28T18:10:00.000Z");
  });

  test("returns 404 when checking in an unknown registration", async ({ api }) => {
    const { eventId } = await seededRegistration(api.db, "Ada Lovelace");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${UNKNOWN_REGISTRATION_ID}/checkin`,
      { method: "POST" },
    );
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_registration_not_found");
  });

  test("returns 404 when checking in an unknown event", async ({ api }) => {
    const response = await api.request(
      `/api/admin/events/${UNKNOWN_EVENT_ID}/registrations/${UNKNOWN_REGISTRATION_ID}/checkin`,
      { method: "POST" },
    );
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_not_found");
  });

  test("returns 404 when removing a check-in that does not exist", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Dorothy Vaughan");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`,
      { method: "DELETE" },
    );
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_checkin_not_found");
  });

  test.for(["POST", "DELETE"])(
    "rejects a malformed registration id on check-in %s",
    async (method, { api }) => {
      const { eventId } = await seededRegistration(api.db, "Ada Lovelace");
      const response = await api.request(
        `/api/admin/events/${eventId}/registrations/${MALFORMED_ID}/checkin`,
        { method },
      );

      expect(response.status).toBe(400);
    },
  );
});

describe("admin registration QR API", () => {
  test("returns a QR document for a paid registration", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Ada Lovelace");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/qr`,
    );
    const body = await success<{
      event: { id: string };
      registration: { id: string };
      payment: { amountMinor: number } | null;
      due: { amountMinor: number; currency: string };
      qrAvailable: boolean;
      qrSvg: string | null;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      event: { id: eventId },
      registration: { id: registrationId },
      payment: { amountMinor: 3000 },
      due: { amountMinor: 3000, currency: "CAD" },
      qrAvailable: true,
    });
    expect(body.data.qrSvg).toContain("<svg");
  });

  test("omits the QR svg for an unpaid registration", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Dorothy Vaughan");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/qr`,
    );
    const body = await success<{
      payment: null;
      due: { amountMinor: number };
      qrAvailable: boolean;
      qrSvg: string | null;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      payment: null,
      due: { amountMinor: 2000 },
      qrAvailable: false,
      qrSvg: null,
    });
  });

  test("treats a zero balance as QR-available without a payment", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Mary Jackson");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/qr`,
    );
    const body = await success<{
      due: { amountMinor: number };
      qrAvailable: boolean;
      qrSvg: string | null;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data.due.amountMinor).toBe(0);
    expect(body.data.qrAvailable).toBe(true);
    expect(body.data.qrSvg).toContain("<svg");
  });

  test("falls back to the event currency for a registration without tickets", async ({ api }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const created = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson(manualBody("No Ticket Holder", "no.ticket@example.com")),
    );
    const createdBody = await success<{ registration: { id: string } }>(created);
    expect.assert(created.status === 201);

    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${createdBody.data.registration.id}/qr`,
    );
    const body = await success<{
      due: { amountMinor: number; currency: string };
      qrAvailable: boolean;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      due: { amountMinor: 0, currency: "CAD" },
      qrAvailable: true,
    });
  });

  test.for([
    {
      name: "unknown event",
      path: (_eventId: string, registrationId: string) =>
        `/api/admin/events/${UNKNOWN_EVENT_ID}/registrations/${registrationId}/qr`,
      code: "event_not_found",
    },
    {
      name: "unknown registration",
      path: (eventId: string, _registrationId: string) =>
        `/api/admin/events/${eventId}/registrations/${UNKNOWN_REGISTRATION_ID}/qr`,
      code: "event_registration_not_found",
    },
  ])("returns 404 for ($name) on QR lookup", async ({ path, code }, { api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Ada Lovelace");
    const response = await api.request(path(eventId, registrationId));
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe(code);
  });

  test("rejects malformed QR parameters", async ({ api }) => {
    const response = await api.request(
      `/api/admin/events/${MALFORMED_ID}/registrations/${MALFORMED_ID}/qr`,
    );

    expect(response.status).toBe(400);
  });
});

describe("admin payment recording API", () => {
  test("records a payment for an unpaid registration", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Alan Turing");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/payment`,
      postJson({ method: "cash", note: "Admin cash" }),
    );
    const body = await success<{
      payment: {
        id: string;
        registrationId: string;
        amountMinor: number;
        currency: string;
        method: string;
        note: string | null;
      };
      emailQueued: boolean;
      created: boolean;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      payment: {
        registrationId,
        amountMinor: 1500,
        currency: "CAD",
        method: "cash",
        note: "Admin cash",
      },
      emailQueued: false,
      created: true,
    });

    const stored = await api.db.events
      .prepare("SELECT id, amount_minor FROM payments WHERE registration_id = ?")
      .bind(registrationId)
      .first<{ id: string; amount_minor: number }>();
    expect.assert(stored !== null && stored.id === body.data.payment.id);
    expect(stored.amount_minor).toBe(1500);
  });

  test("updates an existing payment without re-queuing the email", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Alan Turing");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/payment`,
      postJson({ method: "etransfer", note: "Updated note" }),
    );
    const body = await success<{
      payment: { method: string; note: string | null };
      emailQueued: boolean;
      created: boolean;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      payment: { method: "etransfer", note: "Updated note" },
      emailQueued: false,
      created: false,
    });

    const rows = await api.db.events
      .prepare("SELECT id FROM payments WHERE registration_id = ?")
      .bind(registrationId)
      .all<{ id: string }>();
    expect(rows.results).toHaveLength(1);
  });

  test("queues the payment email and uses the event currency when mail is configured", async ({
    api,
  }) => {
    const { id: eventId } = await seededEvent(api.db, "summer-picnic-2027");
    const created = await api.request(
      `/api/admin/events/${eventId}/registrations/manual`,
      postJson(manualBody("Payment Email", "payment.email@example.com")),
    );
    const createdBody = await success<{ registration: { id: string } }>(created);
    expect.assert(created.status === 201);

    configureMail(api);
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${createdBody.data.registration.id}/payment`,
      postJson({ method: "cash" }),
    );
    const body = await success<{
      payment: { amountMinor: number; currency: string };
      emailQueued: boolean;
      created: boolean;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      payment: { amountMinor: 0, currency: "CAD" },
      emailQueued: true,
      created: true,
    });
    expect(api.queue.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event.payment.confirmed",
        registrationId: createdBody.data.registration.id,
      }) as unknown,
    );
  });

  test("reports a failed payment update when the database returns no row", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Alan Turing");
    const original = api.env.EVENT_ENGINE_DB as D1Like;
    const proxy = proxyEngineDb(original, {
      batch: () => Promise.resolve([{ results: [] }, { results: [] }]),
    });

    try {
      api.env.EVENT_ENGINE_DB = proxy;
      const response = await api.request(
        `/api/admin/events/${eventId}/registrations/${registrationId}/payment`,
        postJson({ method: "cash" }),
      );
      const body = await failure(response);

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("event_payment_update_failed");
    } finally {
      api.env.EVENT_ENGINE_DB = original;
    }
  });

  test("deletes a recorded payment and reports a missing payment", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Alan Turing");
    const path = `/api/admin/events/${eventId}/registrations/${registrationId}/payment`;

    const deleteResponse = await api.request(path, { method: "DELETE" });
    const deleteBody = await success<{ removed: boolean }>(deleteResponse);

    expect(deleteResponse.status).toBe(200);
    expect(deleteBody.data).toEqual({ removed: true });

    const missingResponse = await api.request(path, { method: "DELETE" });
    const missingBody = await failure(missingResponse);

    expect(missingResponse.status).toBe(404);
    expect(missingBody.error.code).toBe("event_payment_not_found");
  });

  test.for([
    { name: "a missing method", body: {} },
    { name: "an unknown method", body: { method: "cheque" } },
    { name: "other without a note", body: { method: "other" } },
    { name: "an overlong note", body: { method: "cash", note: "x".repeat(501) } },
  ])("rejects ($name) when recording a payment", async ({ body: payload }, { api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Alan Turing");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/payment`,
      postJson(payload),
    );
    const body = await failure(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  test("returns 404 when recording a payment for an unknown registration", async ({ api }) => {
    const { eventId } = await seededRegistration(api.db, "Alan Turing");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${UNKNOWN_REGISTRATION_ID}/payment`,
      postJson({ method: "cash" }),
    );
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_registration_not_found");
  });

  test("returns 404 when recording a payment for an unknown event", async ({ api }) => {
    const response = await api.request(
      `/api/admin/events/${UNKNOWN_EVENT_ID}/registrations/${UNKNOWN_REGISTRATION_ID}/payment`,
      postJson({ method: "cash" }),
    );
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_not_found");
  });

  test("returns 404 when deleting a payment that does not exist", async ({ api }) => {
    const { eventId, registrationId } = await seededRegistration(api.db, "Lillian Gilbreth");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/payment`,
      { method: "DELETE" },
    );
    const body = await failure(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("event_payment_not_found");
  });

  test("rejects malformed payment parameters", async ({ api }) => {
    const { eventId } = await seededRegistration(api.db, "Alan Turing");
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${MALFORMED_ID}/payment`,
      postJson({ method: "cash" }),
    );

    expect(response.status).toBe(400);
  });
});

async function registrationEventId(db: TestDatabase) {
  const row = await db.events
    .prepare("SELECT id FROM events WHERE slug = ?")
    .bind("test-event-2027")
    .first<{ id: string }>();
  expect.assert(row !== null, "missing seeded registration event");

  return row.id;
}

function createBody(
  email: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    fullName: "Admin Created Attendee",
    contacts: [{ kind: "email", email, isConfirmation: true }],
    tickets: [{ key: "general", quantity: 1 }],
    consent: true,
    formVersion: 1,
    ...overrides,
  };
}

describe("admin registration creation API", () => {
  test("creates a registration for an event", async ({ api }) => {
    const eventId = await registrationEventId(api.db);
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations`,
      postJson(createBody("admin-created@example.com")),
    );
    const body = await success<{ registration?: { id?: string }; emailQueued?: boolean }>(response);

    expect(response.status).toBe(201);
    expect(body.data.registration?.id).toBeTruthy();
    expect(typeof body.data.emailQueued).toBe("boolean");
  });

  test("returns 404 for an unknown event", async ({ api }) => {
    const response = await api.request(
      `/api/admin/events/${UNKNOWN_EVENT_ID}/registrations`,
      postJson(createBody("unknown-event@example.com")),
    );

    expect(response.status).toBe(404);
  });

  test("rejects a malformed registration body", async ({ api }) => {
    const eventId = await registrationEventId(api.db);
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations`,
      postJson({ contacts: [] }),
    );

    expect(response.status).toBe(400);
  });

  test("maps registration service failures to an error response", async ({ api }) => {
    const eventId = await registrationEventId(api.db);
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations`,
      postJson(
        createBody("unavailable-ticket@example.com", {
          tickets: [{ key: "vip", quantity: 1 }],
        }),
      ),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    const body = await failure(response);
    expect(body.error.code).toBeTruthy();
  });

  test("propagates an unexpected repository error", async ({ api }) => {
    const eventId = await registrationEventId(api.db);
    const repository = getRegistrationRepository(api.db.events);
    const findCreateContext = vi
      .spyOn(repository, "findCreateContext")
      .mockRejectedValueOnce(new Error("unexpected repository failure"));
    onTestFinished(() => {
      findCreateContext.mockRestore();
    });

    const response = await api.request(
      `/api/admin/events/${eventId}/registrations`,
      postJson(createBody("repository-error@example.com")),
    );

    expect(response.status).toBe(500);
  });
});
