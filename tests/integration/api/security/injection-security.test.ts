/* oxlint-disable typescript/no-unsafe-type-assertion, eslint/max-lines -- API bodies are asserted in tests and the attack-surface matrix stays together. */
import { describe, expect, onTestFinished } from "vitest";

import { JSON_HEADERS, PASSWORD } from "../../helpers/constants";
import { eventIdBySlug } from "../../helpers/events";
import {
  expectApiEnvelope,
  expectCountsUnchanged,
  readBody,
  safeHeaderValue,
  snapshotCounts,
  type TableCounts,
  type TableName,
} from "../fuzz/toolkit";
import { test, type ApiHarness } from "../harness";

const SUPPORT_SLUG = "summer-picnic-2027";
const REGISTRATION_SLUG = "test-event-2027";
const ADMIN_EMAILS = new Set(["admin@example.com", "staff@example.com"]);

/** Fixed SQL injection attempts: quotes, stacked statements, unicode and NUL bytes. */
const SQL_PAYLOADS = [
  "' OR 1=1--",
  "'; DROP TABLE registrations;--",
  '" OR "1"="1',
  String.raw`\u0027 OR 1=1--`,
  "\u00E9' OR 1=1--",
  "\u0000' OR 1=1--",
] as const;

/**
 * SQL metacharacters the registration name schema accepts: apostrophes and
 * doubled hyphens (the SQL comment marker). The schema rejects `;`, `=` and
 * control characters, so those belong to the user `name` surface above.
 */
const SQL_NAME_PAYLOADS = ["O'Brien", "D'Angelo--O'Connor", "Élise--Dupont"] as const;

/** Fixed markup payloads used as names, titles, answers and locale header values. */
const XSS_PAYLOADS = [
  "<script>alert(1)</script>",
  '" onmouseover="alert(1)',
  "<img src=x onerror=alert(1)>",
] as const;

/** Header values mixing CRLF/NUL with would-be response header names. */
const HEADER_PAYLOADS = [
  "en\r\nSet-Cookie: injected=1",
  "en\r\nContent-Type: text/html",
  "en\r\nX-Injected: yes\r\n",
  "Set-Cookie: injected=1",
  "Content-Type: text/html",
] as const;

/** Slug/id path segments that try to escape the route into the filesystem. */
const TRAVERSAL_PAYLOADS = ["../", "..%2f", "%2e%2e%2f", "%00", "..%2f..%2fetc%2fpasswd"] as const;

interface Envelope<TData = unknown> {
  status?: string;
  data?: TData;
  error?: { code?: string; message?: string; fields?: string[] };
}

interface CountSnapshot {
  app: Partial<TableCounts>;
  events: Partial<TableCounts>;
}

const APP_COUNT_TABLES = ["user"] as const satisfies readonly TableName[];
const EVENT_COUNT_TABLES = ["events", "registrations"] as const satisfies readonly TableName[];

async function jsonBody<TData>(response: Response): Promise<Envelope<TData>> {
  return (await response.json()) as Envelope<TData>;
}

/** API routes always answer with JSON and refuse to render it as HTML. */
function expectSafeJsonResponse(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("content-type")).not.toContain("text/html");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toContain("script-src 'none'");
}

async function countSnapshot(api: ApiHarness): Promise<CountSnapshot> {
  return {
    app: await snapshotCounts(api.db.app, APP_COUNT_TABLES),
    events: await snapshotCounts(api.db.events, EVENT_COUNT_TABLES),
  };
}

function expectCountsPreserved(before: CountSnapshot, after: CountSnapshot) {
  expectCountsUnchanged(before.app, after.app);
  expectCountsUnchanged(before.events, after.events);
}

async function removeUser(api: ApiHarness, id: string) {
  await api.request(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: JSON_HEADERS,
  });
}

/** Remove every row a manual registration writes, so file-scoped tests stay isolated. */
async function removeRegistration(api: ApiHarness, id: string) {
  const tables = [
    "registration_status_sessions",
    "registration_field_values",
    "registration_tickets",
    "registration_contacts",
    "registration_status_otps",
    "checkins",
    "payments",
  ] as const;
  const statements = [
    ...tables.map((table) =>
      api.db.events.prepare(`DELETE FROM ${table} WHERE registration_id = ?`).bind(id),
    ),
    api.db.events.prepare("DELETE FROM audit_events WHERE target_id = ?").bind(id),
    api.db.events.prepare("DELETE FROM registrations WHERE id = ?").bind(id),
  ];

  await api.db.events.batch(statements);
}

/** Detect raw control bytes without a regex that itself embeds control chars. */
function hasControlBytes(value: string) {
  return value.split("").some((char) => (char.codePointAt(0) ?? 0) < 0x20);
}

function manualRegistrationBody(fullName: string, email: string): Record<string, unknown> {
  return {
    fullName,
    contacts: [{ kind: "email", email, isPrimary: true }],
    tickets: [{ key: "general", quantity: 1 }],
    consent: true,
    formVersion: 1,
  };
}

test.beforeAll(async ({ api }) => {
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

describe("SQL injection through query parameters and identifiers", () => {
  test.for(SQL_PAYLOADS)(
    "admin user search treats %s as data, not SQL",
    async (payload, { api }) => {
      const before = await countSnapshot(api);
      const response = await api.request(`/api/admin/users?q=${encodeURIComponent(payload)}`, {
        headers: { accept: "application/json" },
      });

      expect(response.status).toBeLessThan(500);
      expectSafeJsonResponse(response);
      const body = await jsonBody<{ users?: { email: string }[] }>(response);
      await expectApiEnvelope(response, body);
      expect(body).toMatchObject({ status: "success" });

      const emails = body.data?.users?.map((user) => user.email) ?? [];
      const serialized = JSON.stringify(body);
      // No row from another table, and no SQL error text, can surface here.
      expect(serialized).not.toContain("registration");
      expect(serialized).not.toContain("sqlite");
      // An injected `OR 1=1` would return every account; no SQL metacharacter
      // string may match anything. A leading NUL byte makes Better Auth's
      // third-party `contains` filter a no-op on this admin-only endpoint, but
      // the result is still limited to the seeded admin accounts.
      expect(emails.every((email) => ADMIN_EMAILS.has(email))).toBe(true);
      if (!hasControlBytes(payload)) {
        expect(emails).toEqual([]);
      }
      expectCountsPreserved(before, await countSnapshot(api));
    },
  );

  test.for(SQL_PAYLOADS)(
    "admin event list ignores a hostile search parameter %s",
    async (payload, { api }) => {
      const before = await countSnapshot(api);
      const response = await api.request(
        `/api/admin/events?search=${encodeURIComponent(payload)}`,
        { headers: { accept: "application/json" } },
      );

      expect(response.status).toBeLessThan(500);
      expectSafeJsonResponse(response);
      const body = await readBody(response);
      await expectApiEnvelope(response, body);
      expectCountsPreserved(before, await countSnapshot(api));
    },
  );

  test.for(SQL_PAYLOADS)(
    "public event detail rejects a hostile slug %s without executing SQL",
    async (payload, { api }) => {
      const before = await countSnapshot(api);
      const response = await api.request(`/api/events/${encodeURIComponent(payload)}`, {
        headers: { accept: "application/json" },
      });

      expect(response.status).toBeLessThan(500);
      expect(response.status).toBe(400);
      expectSafeJsonResponse(response);
      const body = await readBody(response);
      await expectApiEnvelope(response, body);
      expectCountsPreserved(before, await countSnapshot(api));
    },
  );

  test.for(SQL_PAYLOADS)(
    "admin support search treats %s as an FTS query, not SQL",
    async (payload, { api }) => {
      const eventId = await eventIdBySlug(api.db, SUPPORT_SLUG);
      const before = await countSnapshot(api);
      const response = await api.request(
        `/api/admin/events/${eventId}/support?q=${encodeURIComponent(payload)}`,
        { headers: { accept: "application/json" } },
      );

      expect(response.status).toBeLessThan(500);
      expectSafeJsonResponse(response);
      const body = await jsonBody<{ registrations?: { fullName: string }[] }>(response);
      await expectApiEnvelope(response, body);
      expect(body).toMatchObject({ status: "success" });
      expect(
        (body.data?.registrations ?? []).every((entry) => !entry.fullName.includes("DROP TABLE")),
      ).toBe(true);
      expectCountsPreserved(before, await countSnapshot(api));
    },
  );

  test.for(SQL_PAYLOADS)(
    "admin registration listing rejects a hostile event id %s",
    async (payload, { api }) => {
      const before = await countSnapshot(api);
      const response = await api.request(
        `/api/admin/events/${encodeURIComponent(payload)}/registrations`,
        { headers: { accept: "application/json" } },
      );

      expect(response.status).toBeLessThan(500);
      expect(response.status).toBe(400);
      expectSafeJsonResponse(response);
      const body = await readBody(response);
      await expectApiEnvelope(response, body);
      expectCountsPreserved(before, await countSnapshot(api));
    },
  );

  test.for(SQL_PAYLOADS)(
    "admin user update with hostile id %s cannot inject SQL",
    async (payload, { api }) => {
      const before = await countSnapshot(api);
      const response = await api.request(`/api/admin/users/${encodeURIComponent(payload)}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: "Should Not Change" }),
      });

      expect(response.status).toBeLessThan(500);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expectSafeJsonResponse(response);
      const body = await jsonBody(response);
      await expectApiEnvelope(response, body);
      expect(body).toMatchObject({ status: "error" });
      expect(body.error?.code).toBeTruthy();
      expectCountsPreserved(before, await countSnapshot(api));
    },
  );
});

describe("SQL metacharacters in JSON string fields", () => {
  test.for(SQL_PAYLOADS)(
    "stores a hostile user name verbatim in D1 (%s)",
    async (payload, { api }) => {
      const email = `sql-user-${crypto.randomUUID()}@example.com`;
      const before = await countSnapshot(api);
      const created = await api.request("/api/admin/users", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: payload, email, password: PASSWORD, role: "user" }),
      });

      expect(created.status).toBe(201);
      const createdBody = await jsonBody<{ user?: { id: string } }>(created);
      expect(createdBody).toMatchObject({ status: "success", data: { user: { email } } });
      const id = createdBody.data?.user?.id ?? "";
      expect(id).toBeTruthy();
      onTestFinished(async () => {
        await removeUser(api, id);
      });

      const row = await api.db.app
        .prepare("SELECT name FROM user WHERE id = ?")
        .bind(id)
        .first<{ name: string }>();
      expect.assert(row !== null, "created user row");
      expect(row.name).toBe(payload);

      const admin = await api.db.app
        .prepare("SELECT email FROM user WHERE email = ?")
        .bind("admin@example.com")
        .first<{ email: string }>();
      expect(admin?.email).toBe("admin@example.com");
      const after = await countSnapshot(api);
      expect(after.app.user).toBe((before.app.user ?? 0) + 1);
      expectCountsUnchanged(before.events, after.events);
    },
  );

  test.for(SQL_NAME_PAYLOADS)(
    "stores a hostile registration full name verbatim in D1 (%s)",
    async (payload, { api }) => {
      const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);
      const email = `sql-registration-${crypto.randomUUID()}@example.com`;
      const before = await countSnapshot(api);
      const created = await api.request(`/api/admin/events/${eventId}/registrations/manual`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(manualRegistrationBody(payload, email)),
      });

      expect(created.status).toBe(201);
      expectSafeJsonResponse(created);
      const createdBody = await jsonBody<{ registration?: { id: string } }>(created);
      const id = createdBody.data?.registration?.id ?? "";
      expect(id).toBeTruthy();
      onTestFinished(async () => {
        await removeRegistration(api, id);
      });

      const row = await api.db.events
        .prepare("SELECT full_name FROM registrations WHERE id = ?")
        .bind(id)
        .first<{ full_name: string }>();
      expect.assert(row !== null, "created registration row");
      expect(row.full_name).toBe(payload);

      const after = await countSnapshot(api);
      expect(after.events.registrations).toBe((before.events.registrations ?? 0) + 1);
      expect(after.events.events).toBe(before.events.events);
      expectCountsUnchanged(before.app, after.app);
    },
  );
});

describe("HTML and script injection", () => {
  test.for(XSS_PAYLOADS)(
    "stores a hostile user name as a literal and answers JSON (%s)",
    async (payload, { api }) => {
      const email = `xss-user-${crypto.randomUUID()}@example.com`;
      const created = await api.request("/api/admin/users", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: payload, email, password: PASSWORD, role: "user" }),
      });

      expect(created.status).toBe(201);
      expectSafeJsonResponse(created);
      const createdBody = await jsonBody<{ user?: { id: string; name: string } }>(created);
      expect(createdBody.data?.user?.name).toBe(payload);
      const id = createdBody.data?.user?.id ?? "";
      onTestFinished(async () => {
        await removeUser(api, id);
      });

      const row = await api.db.app
        .prepare("SELECT name FROM user WHERE id = ?")
        .bind(id)
        .first<{ name: string }>();
      expect.assert(row !== null, "created user row");
      expect(row.name).toBe(payload);
    },
  );

  test.for(XSS_PAYLOADS)(
    "stores a hostile event title as a literal and answers JSON (%s)",
    async (payload, { api }) => {
      const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);
      const original = await api.db.events
        .prepare("SELECT title_json FROM events WHERE id = ?")
        .bind(eventId)
        .first<{ title_json: string }>();
      expect.assert(original !== null, "seeded event title");
      onTestFinished(async () => {
        await api.db.events
          .prepare("UPDATE events SET title_json = ? WHERE id = ?")
          .bind(original.title_json, eventId)
          .run();
      });

      const response = await api.request(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ title: { en: payload } }),
      });

      expect(response.status).toBe(200);
      expectSafeJsonResponse(response);
      const body = await jsonBody<{ event?: { title?: Record<string, string> } }>(response);
      await expectApiEnvelope(response, body);
      expect(body.data?.event?.title?.en).toBe(payload);

      const row = await api.db.events
        .prepare("SELECT title_json FROM events WHERE id = ?")
        .bind(eventId)
        .first<{ title_json: string }>();
      expect.assert(row !== null, "updated event title");
      expect(JSON.parse(row.title_json) as Record<string, string>).toMatchObject({ en: payload });
    },
  );

  test.for(XSS_PAYLOADS)(
    "stores hostile form answers as literals and answers JSON (%s)",
    async (payload, { api }) => {
      const eventId = await eventIdBySlug(api.db, REGISTRATION_SLUG);
      const email = `xss-answer-${crypto.randomUUID()}@example.com`;
      const created = await api.request(`/api/admin/events/${eventId}/registrations/manual`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          ...manualRegistrationBody("XSS Answer Tester", email),
          answers: { injection_note: payload },
        }),
      });

      expect(created.status).toBe(201);
      expectSafeJsonResponse(created);
      const createdBody = await jsonBody<{ registration?: { id: string } }>(created);
      const id = createdBody.data?.registration?.id ?? "";
      onTestFinished(async () => {
        await removeRegistration(api, id);
      });

      const row = await api.db.events
        .prepare(
          "SELECT value_json FROM registration_field_values WHERE registration_id = ? AND field_key = ?",
        )
        .bind(id, "injection_note")
        .first<{ value_json: string }>();
      expect.assert(row !== null, "stored form answer");
      expect(JSON.parse(row.value_json) as unknown).toBe(payload);
    },
  );

  test.for(XSS_PAYLOADS)(
    "localized error messages never echo raw markup from x-locale (%s)",
    async (payload, { api }) => {
      const response = await api.request("/api/admin/users?page=not-a-number", {
        headers: { "x-locale": payload, accept: "application/json" },
      });

      expect(response.status).toBe(400);
      expectSafeJsonResponse(response);
      const body = await jsonBody<{ error?: { code?: string; message?: string } }>(response);
      await expectApiEnvelope(response, body);
      expect(body).toMatchObject({ status: "error", error: { code: "bad_request" } });
      expect(body.error?.message).toBeTruthy();

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("<script>");
      expect(serialized).not.toContain("<img");
      expect(serialized).not.toContain("onerror=");
      expect(serialized).not.toContain("onmouseover=");
    },
  );
});

describe("header injection through locale headers", () => {
  test.for(HEADER_PAYLOADS)(
    "locale header %s cannot create extra response headers or cookies",
    async (payload, { api }) => {
      const value = safeHeaderValue(payload);
      const response = await api.request("/api/admin/users?page=not-a-number", {
        headers: {
          "x-locale": value,
          "accept-language": value,
          accept: "application/json",
        },
      });

      expect(response.status).toBe(400);
      expectSafeJsonResponse(response);
      const body = await jsonBody<{ error?: { code?: string; message?: string } }>(response);
      await expectApiEnvelope(response, body);
      expect(body).toMatchObject({ status: "error", error: { code: "bad_request" } });

      const setCookie = response.headers.get("set-cookie");
      expect(setCookie === null || !setCookie.includes("injected")).toBe(true);
      expect(response.headers.get("x-injected")).toBeNull();
    },
  );

  test("rejects raw CRLF and NUL bytes in locale headers before they reach the app", () => {
    for (const payload of HEADER_PAYLOADS) {
      if (hasControlBytes(payload)) {
        expect(() => new Headers({ "x-locale": payload })).toThrow(TypeError);
        expect(() => new Headers({ "accept-language": payload })).toThrow(TypeError);
      }
    }
  });
});

describe("path traversal in slugs and identifiers", () => {
  test.for(TRAVERSAL_PAYLOADS)(
    "public event detail rejects traversal segment %s without leaking paths",
    async (segment, { api }) => {
      const before = await countSnapshot(api);
      const response = await api.request(`/api/events/${segment}`, {
        headers: { accept: "application/json" },
      });

      expect(response.status).toBeLessThan(500);
      expect([400, 404]).toContain(response.status);
      expectSafeJsonResponse(response);
      const body = await readBody(response);
      await expectApiEnvelope(response, body);

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("etc/passwd");
      expect(serialized).not.toContain("node_modules");
      expect(serialized).not.toMatch(/ENOENT|\.\.[\\/]|src\//u);
      expectCountsPreserved(before, await countSnapshot(api));
    },
  );

  test.for(TRAVERSAL_PAYLOADS)(
    "admin event detail rejects traversal segment %s without leaking paths",
    async (segment, { api }) => {
      const before = await countSnapshot(api);
      const response = await api.request(`/api/admin/events/${segment}`, {
        headers: { accept: "application/json" },
      });

      expect(response.status).toBeLessThan(500);
      expect([400, 404]).toContain(response.status);
      expectSafeJsonResponse(response);
      const body = await readBody(response);
      await expectApiEnvelope(response, body);

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("etc/passwd");
      expect(serialized).not.toMatch(/ENOENT|\.\.[\\/]|src\//u);
      expectCountsPreserved(before, await countSnapshot(api));
    },
  );
});
