/* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-call -- API response bodies, D1 JSON columns and the fetched email stub are asserted here. */
import { createHash } from "node:crypto";

import { describe, expect, vi } from "vitest";

import { issueStatusOtp } from "~/features/events/server/services/status";

import { getRegistrationStatusRepository } from "../../../src/platform/server/db/events";
import type { TestDatabase } from "../helpers/d1";
import { eventIdBySlug } from "../helpers/events";
import { statusSessionToken } from "../helpers/status-session";
import { test, type ApiHarness } from "./harness";

const REGISTRATION_SLUG = "test-event-2027";
const FULL_NAME = "Db Flow Lifecycle Attendee";
const EMAIL = "db-flow-lifecycle@example.com";
const ANSWER = "DB Flow Co";
const MAIL_KEYS = [
  "MAILTRAP_API_URL",
  "MAILTRAP_API_TOKEN",
  "MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED",
  "MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED",
  "MAILTRAP_TEMPLATE_STATUS_OTP",
  "MAILTRAP_TEMPLATE_TWO_FACTOR_CODE",
] as const;

/** Shared lifecycle state created once for the whole file. */
let eventId = "";
let registrationId = "";
let creationStatus = 0;

async function requireRow<Row>(db: TestDatabase, sql: string, ...params: unknown[]): Promise<Row> {
  const row = await db.events
    .prepare(sql)
    .bind(...params)
    .first<Row>();
  expect.assert(row !== null, `expected a D1 row for: ${sql}`);

  return row;
}

async function countRows(db: TestDatabase, sql: string, ...params: unknown[]) {
  const row = await db.events
    .prepare(sql)
    .bind(...params)
    .first<{ count: number }>();
  expect.assert(row !== null, "expected a D1 row count");

  return row.count;
}

async function responseData<Data>(response: Response): Promise<Data> {
  const payload = (await response.json()) as { data: Data };

  return payload.data;
}

async function errorCode(response: Response) {
  const payload = (await response.json()) as { error?: { code?: string } };

  return payload.error?.code;
}

function registrationBody(
  email: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    fullName: FULL_NAME,
    contacts: [{ kind: "email", email, isConfirmation: true }],
    tickets: [{ key: "general", quantity: 1 }],
    consent: true,
    formVersion: 1,
    answers: { company: ANSWER },
    ...overrides,
  };
}

function postRegistration(api: ApiHarness, email: string): Promise<Response> {
  return api.request(`/api/events/${REGISTRATION_SLUG}/registrations`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-turnstile-token": "test-token" },
    body: JSON.stringify(registrationBody(email)),
  });
}

function postJson(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

test.beforeAll(async ({ api }) => {
  // Authenticate once. Enabling 2FA means signIn() would return a challenge
  // from this point on, so admin calls below reuse this single session.
  await api.signIn("admin@example.com");

  eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);

  const originalQueue = api.env.EMAIL_QUEUE;
  const originalMail = MAIL_KEYS.map((key) => api.env[key]);
  const originalFetch = globalThis.fetch;

  // Make the email transport succeed locally and drop the queue binding so the
  // registration email is claimed through the real delivery ledger in DEV.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("https://mailtrap.test/")) {
      return Promise.resolve(new Response("{}", { status: 200 }));
    }

    return originalFetch(input, init);
  });

  try {
    api.env.MAILTRAP_API_URL = "https://mailtrap.test/send";
    api.env.MAILTRAP_API_TOKEN = "test-token";
    api.env.MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED = "test-registration-template";
    api.env.MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED = "test-payment-template";
    api.env.MAILTRAP_TEMPLATE_STATUS_OTP = "test-status-otp-template";
    api.env.MAILTRAP_TEMPLATE_TWO_FACTOR_CODE = "test-two-factor-template";
    api.env.EMAIL_QUEUE = undefined;

    const response = await postRegistration(api, EMAIL);
    creationStatus = response.status;
    const data = await responseData<{ registration: { id: string } }>(response);
    registrationId = data.registration.id;
  } finally {
    vi.stubGlobal("fetch", originalFetch);
    api.env.EMAIL_QUEUE = originalQueue;
    for (const [index, key] of MAIL_KEYS.entries()) {
      api.env[key] = originalMail[index];
    }
  }
});

describe("registration creation persists D1 rows", () => {
  test("persists the registration, contact, ticket, answer and email rows on creation", async ({
    api,
  }) => {
    expect(creationStatus).toBe(201);

    const stored = await requireRow<{
      id: string;
      event_id: string;
      form_version: number;
      full_name: string;
      full_name_normalized: string;
    }>(
      api.db,
      "SELECT id, event_id, form_version, full_name, full_name_normalized FROM registrations WHERE id = ?",
      registrationId,
    );
    expect(stored).toMatchObject({
      id: registrationId,
      event_id: eventId,
      form_version: 1,
      full_name: FULL_NAME,
      full_name_normalized: FULL_NAME.toLowerCase(),
    });

    const contact = await requireRow<{
      registration_id: string;
      event_id: string;
      kind: string;
      email_normalized: string;
      is_confirmation_method: number;
    }>(
      api.db,
      `SELECT registration_id, event_id, kind, email_normalized, is_confirmation_method
         FROM registration_contacts WHERE registration_id = ? AND kind = 'email'`,
      registrationId,
    );
    expect(contact).toMatchObject({
      registration_id: registrationId,
      event_id: eventId,
      kind: "email",
      email_normalized: EMAIL,
      is_confirmation_method: 1,
    });

    const ticket = await requireRow<{
      registration_id: string;
      event_id: string;
      ticket_type_key: string;
      quantity: number;
      unit_price_minor: number;
      currency: string;
    }>(
      api.db,
      `SELECT registration_id, event_id, ticket_type_key, quantity, unit_price_minor, currency
         FROM registration_tickets WHERE registration_id = ?`,
      registrationId,
    );
    expect(ticket).toMatchObject({
      registration_id: registrationId,
      event_id: eventId,
      ticket_type_key: "general",
      quantity: 1,
      unit_price_minor: 2000,
      currency: "CAD",
    });

    const answer = await requireRow<{
      registration_id: string;
      field_key: string;
      form_version: number;
      value_json: string;
    }>(
      api.db,
      `SELECT registration_id, field_key, form_version, value_json
         FROM registration_field_values WHERE registration_id = ?`,
      registrationId,
    );
    expect(answer).toMatchObject({
      registration_id: registrationId,
      field_key: "company",
      form_version: 1,
    });
    expect(JSON.parse(answer.value_json)).toBe(ANSWER);

    const idempotencyKey = `event.registration.received:${registrationId}`;
    const delivery = await api.db.app
      .prepare(
        "SELECT idempotency_key, job_type, status FROM email_deliveries WHERE idempotency_key = ?",
      )
      .bind(idempotencyKey)
      .first<{ idempotency_key: string; job_type: string; status: string }>();
    expect.assert(delivery !== null, "expected a confirmation email delivery row");
    expect(delivery).toMatchObject({
      idempotency_key: idempotencyKey,
      job_type: "event.registration.received",
      status: "sent",
    });
  });
});

describe("admin registration list reads persisted state", () => {
  test("lists the new registration with fields matching its D1 row", async ({ api }) => {
    const stored = await requireRow<{
      id: string;
      event_id: string;
      form_version: number;
      full_name: string;
    }>(
      api.db,
      "SELECT id, event_id, form_version, full_name FROM registrations WHERE id = ?",
      registrationId,
    );
    const response = await api.request(`/api/admin/events/${eventId}/registrations`);
    const data = await responseData<{
      registrations: {
        id: string;
        eventId: string;
        formVersion: number;
        fullName: string;
        contacts: { emailAddress?: string }[];
        tickets: { key: string; quantity: number }[];
      }[];
    }>(response);

    expect(response.status).toBe(200);
    const listed = data.registrations.find((entry) => entry.id === registrationId);
    expect.assert(listed !== undefined, "expected the new registration in the admin list");
    expect(listed).toMatchObject({
      id: stored.id,
      eventId: stored.event_id,
      formVersion: stored.form_version,
      fullName: stored.full_name,
    });
    expect(listed.contacts).toContainEqual(expect.objectContaining({ emailAddress: EMAIL }));
    expect(listed.tickets).toContainEqual(expect.objectContaining({ key: "general", quantity: 1 }));
  });
});

describe("payment and QR reflect persisted state", () => {
  test("records a payment row and reflects the paid state through the QR endpoint", async ({
    api,
  }) => {
    const due = await requireRow<{ amount_minor: number; currency: string }>(
      api.db,
      `SELECT SUM(quantity * unit_price_minor) AS amount_minor, MAX(currency) AS currency
         FROM registration_tickets WHERE registration_id = ?`,
      registrationId,
    );
    expect(due).toMatchObject({ amount_minor: 2000, currency: "CAD" });

    expect(
      await countRows(
        api.db,
        "SELECT COUNT(*) AS count FROM payments WHERE registration_id = ?",
        registrationId,
      ),
    ).toBe(0);

    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/payment`,
      postJson({ method: "cash", note: "DB flow payment" }),
    );
    const data = await responseData<{
      created: boolean;
      payment: {
        id: string;
        registrationId: string;
        amountMinor: number;
        currency: string;
        method: string;
      };
    }>(response);

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      created: true,
      payment: {
        registrationId,
        amountMinor: due.amount_minor,
        currency: due.currency,
        method: "cash",
      },
    });

    const stored = await requireRow<{
      id: string;
      event_id: string;
      registration_id: string;
      amount_minor: number;
      currency: string;
      method: string;
    }>(
      api.db,
      `SELECT id, event_id, registration_id, amount_minor, currency, method
         FROM payments WHERE registration_id = ?`,
      registrationId,
    );
    expect(stored).toMatchObject({
      id: data.payment.id,
      event_id: eventId,
      registration_id: registrationId,
      amount_minor: due.amount_minor,
      currency: due.currency,
      method: "cash",
    });
    expect(
      await countRows(
        api.db,
        "SELECT COUNT(*) AS count FROM payments WHERE registration_id = ?",
        registrationId,
      ),
    ).toBe(1);

    const qr = await api.request(`/api/admin/events/${eventId}/registrations/${registrationId}/qr`);
    const qrData = await responseData<{
      registration: { id: string };
      payment: { amountMinor: number } | null;
      due: { amountMinor: number; currency: string };
      qrAvailable: boolean;
      qrSvg: string | null;
    }>(qr);

    expect(qr.status).toBe(200);
    expect(qrData).toMatchObject({
      registration: { id: registrationId },
      payment: { amountMinor: due.amount_minor },
      due: { amountMinor: due.amount_minor, currency: due.currency },
      qrAvailable: true,
    });
    expect(qrData.qrSvg).toContain("<svg");
  });
});

describe("check-in lifecycle persists and removes rows", () => {
  test("creates exactly one check-in row after payment", async ({ api }) => {
    const path = `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`;
    expect(
      await countRows(
        api.db,
        "SELECT COUNT(*) AS count FROM checkins WHERE registration_id = ?",
        registrationId,
      ),
    ).toBe(0);

    const response = await api.request(path, { method: "POST" });
    const data = await responseData<{
      registration: { id: string };
      checkin: { id: string; registrationId: string };
      alreadyCheckedIn: boolean;
    }>(response);

    expect(response.status).toBe(201);
    expect(data).toMatchObject({
      registration: { id: registrationId },
      checkin: { registrationId },
      alreadyCheckedIn: false,
    });

    const stored = await requireRow<{
      id: string;
      event_id: string;
      registration_id: string;
      checked_in_at: string;
    }>(
      api.db,
      "SELECT id, event_id, registration_id, checked_in_at FROM checkins WHERE registration_id = ?",
      registrationId,
    );
    expect(stored).toMatchObject({
      id: data.checkin.id,
      event_id: eventId,
      registration_id: registrationId,
    });
    expect(stored.checked_in_at).toBeTruthy();
  });

  test.for([2, 3])("keeps a single check-in row on repeat %i", async (_attempt, { api }) => {
    const response = await api.request(
      `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`,
      { method: "POST" },
    );
    const data = await responseData<{ checkin: { id: string }; alreadyCheckedIn: boolean }>(
      response,
    );

    expect(response.status).toBe(200);
    expect(data.alreadyCheckedIn).toBe(true);
    expect(
      await countRows(
        api.db,
        "SELECT COUNT(*) AS count FROM checkins WHERE registration_id = ?",
        registrationId,
      ),
    ).toBe(1);

    const stored = await requireRow<{ id: string }>(
      api.db,
      "SELECT id FROM checkins WHERE registration_id = ?",
      registrationId,
    );
    expect(stored.id).toBe(data.checkin.id);
  });

  test("removes the check-in row when the check-in is deleted", async ({ api }) => {
    const path = `/api/admin/events/${eventId}/registrations/${registrationId}/checkin`;
    const response = await api.request(path, { method: "DELETE" });
    const data = await responseData<{ removed: boolean }>(response);

    expect(response.status).toBe(200);
    expect(data).toEqual({ removed: true });
    expect(
      await countRows(
        api.db,
        "SELECT COUNT(*) AS count FROM checkins WHERE registration_id = ?",
        registrationId,
      ),
    ).toBe(0);
  });
});

describe("status flow persists OTP and session rows", () => {
  test("issues, verifies and reads a status session back from D1", async ({ api }) => {
    // Issue the OTP through the same service the status endpoint uses so we can
    // read the plaintext code (D1 stores only its hash).
    const issued = await issueStatusOtp(
      getRegistrationStatusRepository(api.db.events),
      registrationId,
    );
    expect(issued.ok).toBe(true);

    if (!issued.ok) {
      return;
    }

    const otp = await requireRow<{
      id: string;
      registration_id: string;
      code_hash: string;
      consumed_at: string | null;
    }>(
      api.db,
      "SELECT id, registration_id, code_hash, consumed_at FROM registration_status_otps WHERE id = ?",
      issued.otp.id,
    );
    expect(otp).toMatchObject({
      id: issued.otp.id,
      registration_id: registrationId,
      consumed_at: null,
    });
    expect(otp.code_hash).toBeTruthy();

    // The fresh OTP's resend window means the endpoint cannot add a second row.
    const request = await api.request("/api/events/status/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, email: EMAIL }),
    });
    const notice = await responseData<{ notice: string }>(request);

    expect(request.status).toBe(200);
    expect(notice.notice).toBe("event_code_sent");
    expect(
      await countRows(
        api.db,
        "SELECT COUNT(*) AS count FROM registration_status_otps WHERE registration_id = ?",
        registrationId,
      ),
    ).toBe(1);

    const verify = await api.request("/api/events/status/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, code: issued.otp.code }),
    });
    const verified = await responseData<{ ok: boolean }>(verify);
    const token = statusSessionToken(verify);

    expect(verify.status).toBe(200);
    expect(verified.ok).toBe(true);
    expect(token).toBeTruthy();

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await requireRow<{ registration_id: string; token_hash: string }>(
      api.db,
      "SELECT registration_id, token_hash FROM registration_status_sessions WHERE token_hash = ?",
      tokenHash,
    );
    expect(session).toMatchObject({ registration_id: registrationId, token_hash: tokenHash });

    // This harness carries an authenticated browser cookie, so use the API
    // header fallback instead of replacing its cookie jar.
    const status = await api.request("/api/events/status", {
      headers: { "x-status-token": token },
    });
    const document = await responseData<{
      event: { id: string };
      registration: { id: string; fullName: string };
      paid: boolean;
      qrSvg: string | null;
    }>(status);

    expect(status.status).toBe(200);
    expect(document.event).toMatchObject({ id: eventId });
    expect(document.registration).toMatchObject({ id: registrationId, fullName: FULL_NAME });
    expect(document.paid).toBe(true);
    expect(document.qrSvg).toContain("<svg");
  });
});

describe("duplicate registration leaves D1 unchanged", () => {
  test("rejects a duplicate email without adding registration or stats rows", async ({ api }) => {
    const before = await countRows(
      api.db,
      "SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?",
      eventId,
    );
    const statsBefore = await requireRow<{ registration_count: number; tickets_total: number }>(
      api.db,
      "SELECT registration_count, tickets_total FROM registration_stats WHERE event_id = ?",
      eventId,
    );

    const response = await postRegistration(api, EMAIL);

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("event_duplicate_registration");
    expect(
      await countRows(
        api.db,
        "SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?",
        eventId,
      ),
    ).toBe(before);

    const statsAfter = await requireRow<{ registration_count: number; tickets_total: number }>(
      api.db,
      "SELECT registration_count, tickets_total FROM registration_stats WHERE event_id = ?",
      eventId,
    );
    expect(statsAfter).toMatchObject(statsBefore);
  });
});
