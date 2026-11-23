/* oxlint-disable typescript/no-unsafe-type-assertion -- API and KV bodies are parsed and asserted in tests. */
import { describe, expect, onTestFinished } from "vitest";

import { JSON_HEADERS, PASSWORD } from "../helpers/constants";
import { expectRow, parseJson } from "../helpers/http";
import { test, type ApiHarness } from "./harness";

type Role = "user" | "admin" | "event_staff" | "event_checkin";

interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface ListBody {
  data?: { users?: UserDto[] };
}

interface CreateBody {
  data?: { user?: UserDto };
}

interface AppUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: number;
  two_factor_enabled: number;
}

interface AccountRow {
  id: string;
  user_id: string;
  provider_id: string;
  password: string;
}

/** Better Auth caches the user together with the session in every KV record. */
interface SessionRecord {
  session?: { userId?: string; token?: string; expiresAt?: string };
  user?: { id?: string; email?: string; role?: string; twoFactorEnabled?: boolean };
}

function parseSessionRecord(raw: unknown): SessionRecord | null {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SessionRecord;
    return parsed.session === undefined ? null : parsed;
  } catch {
    return null;
  }
}

async function sessionKeysForEmail(api: ApiHarness, email: string): Promise<string[]> {
  const { keys } = await api.db.kv.list();
  const records = await Promise.all(
    keys.map(async ({ name }) => ({
      name,
      record: parseSessionRecord(await api.db.kv.get(name)),
    })),
  );

  return records.filter(({ record }) => record?.user?.email === email).map(({ name }) => name);
}

async function sessionRecordFor(api: ApiHarness, key: string): Promise<SessionRecord> {
  return expectRow(parseSessionRecord(await api.db.kv.get(key)));
}

async function userIdFor(api: ApiHarness, email: string) {
  const row = await api.db.app
    .prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();

  return expectRow(row).id;
}

async function userRowFor(api: ApiHarness, id: string): Promise<AppUserRow> {
  return expectRow(
    await api.db.app
      .prepare(
        "SELECT id, name, email, role, created_at, two_factor_enabled FROM user WHERE id = ?",
      )
      .bind(id)
      .first<AppUserRow>(),
  );
}

async function createUser(
  api: ApiHarness,
  details: { email: string; name: string; role: Role },
): Promise<UserDto> {
  const response = await api.request("/api/admin/users", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ ...details, password: PASSWORD }),
  });

  expect(response.status).toBe(201);
  const body = await parseJson<CreateBody>(response);
  return expectRow(body.data?.user);
}

/** Delete a provisioned user while the acting admin session is still installed. */
function deleteOnTestFinished(api: ApiHarness, id: string) {
  onTestFinished(async () => {
    await api.request(`/api/admin/users/${id}`, { method: "DELETE" });
  });
}

test.beforeAll(async ({ api }) => {
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

describe("admin user management writes through to the app database", () => {
  test.for([
    { role: "user", name: "Plain User" },
    { role: "event_staff", name: "Staff Member" },
    { role: "event_checkin", name: "Check-in Clerk" },
  ] as const)(
    "persists a $role user row and a hashed credential account",
    async (roleCase, { api }) => {
      const email = `db-create-${roleCase.role}-${Date.now()}@example.com`;
      const dto = await createUser(api, { email, name: roleCase.name, role: roleCase.role });
      deleteOnTestFinished(api, dto.id);

      expect(dto).toMatchObject({ name: roleCase.name, email, role: roleCase.role });
      expect(await userRowFor(api, dto.id)).toMatchObject({
        id: dto.id,
        name: roleCase.name,
        email,
        role: roleCase.role,
      });

      const account = expectRow(
        await api.db.app
          .prepare("SELECT id, user_id, provider_id, password FROM account WHERE user_id = ?")
          .bind(dto.id)
          .first<AccountRow>(),
      );

      expect(account).toMatchObject({ user_id: dto.id, provider_id: "credential" });
      expect(account.password).toMatch(/^pbkdf2_/u);
      expect(account.password).not.toContain(PASSWORD);
    },
  );

  test("searching a created email returns a DTO that matches its D1 row", async ({ api }) => {
    const email = `db-search-${Date.now()}@example.com`;
    const dto = await createUser(api, { email, name: "Searchable", role: "user" });
    deleteOnTestFinished(api, dto.id);

    const response = await api.request(`/api/admin/users?q=${encodeURIComponent(email)}`);
    expect(response.status).toBe(200);
    const body = await parseJson<ListBody>(response);

    expect(body.data?.users).toHaveLength(1);
    const listed = expectRow(body.data?.users?.[0]);
    expect(listed).toMatchObject(dto);

    const row = await userRowFor(api, dto.id);
    expect(listed).toMatchObject({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: new Date(row.created_at).toISOString(),
    });
  });

  test("patching a name and role changes D1 and the next admin list shows the new values", async ({
    api,
  }) => {
    const email = `db-patch-${Date.now()}@example.com`;
    const dto = await createUser(api, { email, name: "Before", role: "user" });
    deleteOnTestFinished(api, dto.id);

    const response = await api.request(`/api/admin/users/${dto.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "After", role: "event_checkin" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { updated: true } });
    expect(await userRowFor(api, dto.id)).toMatchObject({
      name: "After",
      role: "event_checkin",
      email,
    });

    const list = await parseJson<ListBody>(
      await api.request("/api/admin/users?role=event_checkin"),
    );

    expect(list.data?.users?.map((user) => user.id)).toContain(dto.id);
    expect(expectRow(list.data?.users?.find((user) => user.id === dto.id))).toMatchObject({
      name: "After",
      role: "event_checkin",
    });
  });

  test("deleting a user removes its D1 rows and its credentials stop signing in", async ({
    api,
  }) => {
    const email = `db-delete-${Date.now()}@example.com`;
    const dto = await createUser(api, { email, name: "Doomed", role: "user" });
    const account = expectRow(
      await api.db.app
        .prepare("SELECT id FROM account WHERE user_id = ?")
        .bind(dto.id)
        .first<{ id: string }>(),
    );

    // A D1 session row cascades with the user even though live sessions live in KV.
    const now = Date.now();
    await api.db.app
      .prepare(
        "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(dto.id, now + 60_000, `manual-token-${dto.id}`, now, now, dto.id)
      .run();

    const response = await api.request(`/api/admin/users/${dto.id}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { removed: true } });

    expect(
      await api.db.app.prepare("SELECT id FROM user WHERE id = ?").bind(dto.id).first(),
    ).toBeNull();
    expect(
      await api.db.app.prepare("SELECT id FROM account WHERE id = ?").bind(account.id).first(),
    ).toBeNull();
    const sessions = await api.db.app
      .prepare("SELECT id FROM session WHERE user_id = ?")
      .bind(dto.id)
      .all<{ id: string }>();
    expect(sessions.results).toHaveLength(0);

    // Call the endpoint directly so the harness keeps the acting admin session.
    const signIn = await api.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(signIn.status).toBe(401);

    const list = await parseJson<ListBody>(
      await api.request(`/api/admin/users?q=${encodeURIComponent(email)}`),
    );
    expect(list.data?.users ?? []).toHaveLength(0);
  });
});

describe("two-factor enrollment persists in D1 and gates admin access", () => {
  test("the seeded admin enrollment is stored in D1 and cached in KV", async ({ api }) => {
    const adminId = await userIdFor(api, "admin@example.com");
    const adminRow = await userRowFor(api, adminId);
    expect(adminRow.two_factor_enabled).toBe(1);

    const keys = await sessionKeysForEmail(api, "admin@example.com");
    expect(keys.length).toBeGreaterThan(0);
    expect(await sessionRecordFor(api, expectRow(keys[0]))).toMatchObject({
      session: { userId: adminId },
      user: { email: "admin@example.com", role: "admin", twoFactorEnabled: true },
    });

    const response = await api.request("/api/admin/users");
    expect(response.status).toBe(200);
  });

  test("an admin session is rejected until enrollment is persisted, then allowed", async ({
    api,
  }) => {
    const email = `db-2fa-${Date.now()}@example.com`;
    const dto = await createUser(api, { email, name: "Second Factor", role: "admin" });
    const userId = dto.id;

    // This test signs in as the new admin, so the harness cookie no longer
    // belongs to an administrator that could delete it through the API.
    onTestFinished(async () => {
      const keys = await sessionKeysForEmail(api, email);
      await Promise.all(keys.map((key) => api.db.kv.delete(key)));
      await api.db.kv.delete(`active-sessions-${userId}`);
      await api.db.app.prepare("DELETE FROM user WHERE id = ?").bind(userId).run();
    });

    await api.signIn(email, PASSWORD);
    const keys = await sessionKeysForEmail(api, email);
    expect(keys).toHaveLength(1);
    expect(await sessionRecordFor(api, expectRow(keys[0]))).toMatchObject({
      session: { userId },
      user: { email, role: "admin", twoFactorEnabled: false },
    });

    const unenrolled = await api.request("/api/admin/users");
    expect(unenrolled.status).toBe(403);
    await expect(unenrolled.json()).resolves.toMatchObject({
      error: { code: "two_factor_required" },
    });

    await api.enableTwoFactor(email);

    const enrolledRow = await userRowFor(api, userId);
    expect(enrolledRow.two_factor_enabled).toBe(1);
    const enrolledKeys = await sessionKeysForEmail(api, email);
    expect(enrolledKeys).toHaveLength(1);
    expect(await sessionRecordFor(api, expectRow(enrolledKeys[0]))).toMatchObject({
      session: { userId },
      user: { email, role: "admin", twoFactorEnabled: true },
    });

    // Email OTP enrollment sets the user flag only; the TOTP secret table stays empty.
    const totpRows = await api.db.app
      .prepare("SELECT id FROM two_factor WHERE user_id = ?")
      .bind(userId)
      .all<{ id: string }>();
    expect(totpRows.results).toHaveLength(0);

    const enrolled = await api.request("/api/admin/users");
    expect(enrolled.status).toBe(200);
    const enrolledBody = await parseJson<ListBody>(enrolled);
    expect(enrolledBody.data?.users?.map((user) => user.id)).toContain(userId);
  });
});

describe("session lifecycle is persisted in the KV session namespace", () => {
  test("signing out removes the KV session and later requests see no session", async ({ api }) => {
    onTestFinished(() => {
      api.clearSession();
    });

    const email = "staff@example.com";
    await api.signIn(email);

    // Sessions are stored only in KV (storeSessionInDatabase = false), so a
    // freshly signed-in user still has no row in the D1 session table.
    const d1Sessions = await api.db.app.prepare("SELECT id FROM session").all<{ id: string }>();
    expect(d1Sessions.results).toHaveLength(0);

    const staffId = await userIdFor(api, email);
    const staffRow = await userRowFor(api, staffId);
    expect(staffRow.two_factor_enabled).toBe(0);

    const keys = await sessionKeysForEmail(api, email);
    expect(keys).toHaveLength(1);
    const sessionKey = expectRow(keys[0]);
    const record = await sessionRecordFor(api, sessionKey);
    expect(record).toMatchObject({
      session: { userId: staffId, token: sessionKey },
      user: { email, role: "event_staff" },
    });

    const activeSessionsKey = `active-sessions-${staffId}`;
    expect(await api.db.kv.get(activeSessionsKey)).not.toBeNull();

    const signOut = await api.request("/api/auth/sign-out", { method: "POST" });
    expect(signOut.status).toBe(200);
    await expect(signOut.json()).resolves.toMatchObject({ success: true });

    expect(await api.db.kv.get(sessionKey)).toBeNull();
    expect(await api.db.kv.get(activeSessionsKey)).toBeNull();
    expect(await sessionKeysForEmail(api, email)).toHaveLength(0);

    // The harness still holds the signed-out cookie; the API must reject it.
    const afterSignOut = await api.request("/api/admin/users");
    expect(afterSignOut.status).toBe(401);
    await expect(afterSignOut.json()).resolves.toMatchObject({
      error: { code: "unauthorized" },
    });
  });
});
