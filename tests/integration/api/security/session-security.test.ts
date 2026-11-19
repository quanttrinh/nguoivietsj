/* oxlint-disable typescript/no-unsafe-type-assertion -- API and KV bodies are parsed and asserted in tests. */
import { describe, expect, onTestFinished } from "vitest";

import { test, type ApiHarness } from "../harness";

type Role = "user" | "admin" | "event_staff";
type SessionClient = (path: string, init?: RequestInit) => Promise<Response>;

interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AppUserRow {
  role: string;
  banned: number;
  twoFactorEnabled: number;
}

interface SessionRecord {
  session?: { userId?: string; token?: string };
  user?: { email?: string; role?: string; twoFactorEnabled?: boolean };
}

interface SessionBody {
  session?: { token?: string };
}

interface SignInOptions {
  password?: string;
  cookie?: string;
}

interface SignInResult {
  response: Response;
  cookie: string;
  token: string;
}

const JSON_HEADERS = { "content-type": "application/json" };
const PASSWORD = "dev-password-123";
const STAFF_EMAIL = "staff@example.com";
const SESSION_COOKIE = "better-auth.session_token";

let adminCookie = "";

function parseJson<TValue>(response: Response): Promise<TValue> {
  return response.json() as Promise<TValue>;
}

/** Assert a nullable lookup returned a value and narrow its type for later reads. */
function expectRow<TValue>(row: TValue | null | undefined): TValue {
  expect(row).toBeTruthy();

  if (row == null) {
    throw new Error("Expected a value");
  }

  return row;
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

/** The KV key is the random token before the HMAC signature in the signed cookie. */
function sessionToken(cookie: string): string {
  const nameValue = expectRow(cookie.split(";")[0]);
  const signedValue = expectRow(nameValue.slice(nameValue.indexOf("=") + 1));
  return expectRow(signedValue.split(".")[0]);
}

/** The harness overrides `cookie` when it holds one, so it is cleared in beforeAll. */
function clientFor(api: ApiHarness, cookie: string): SessionClient {
  return (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    return api.request(path, { ...init, headers });
  };
}

/** Sign in without installing the cookie in the harness so tests can hold several sessions. */
async function signInRaw(
  api: ApiHarness,
  email: string,
  options: SignInOptions = {},
): Promise<SignInResult> {
  const headers: Record<string, string> = { ...JSON_HEADERS };

  if (options.cookie !== undefined) {
    headers.cookie = options.cookie;
  }

  const response = await api.request("/api/auth/sign-in/email", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: options.password ?? "dev-password" }),
  });
  const cookie = cookieHeader(response);

  // A 2FA challenge or a rejected sign-in sets no session cookie.
  return { response, cookie, token: cookie.length === 0 ? "" : sessionToken(cookie) };
}

async function userIdFor(api: ApiHarness, email: string): Promise<string> {
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
        'SELECT role, banned, two_factor_enabled AS "twoFactorEnabled" FROM user WHERE id = ?',
      )
      .bind(id)
      .first<AppUserRow>(),
  );
}

async function createUser(admin: SessionClient, email: string, role: Role): Promise<UserDto> {
  const response = await admin("/api/admin/users", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: "Security Probe", email, password: PASSWORD, role }),
  });

  expect(response.status).toBe(201);
  const body = await parseJson<{ data?: { user?: UserDto } }>(response);
  return expectRow(body.data?.user);
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

/** Remove every KV artifact for a user, then delete the user through the admin API. */
async function cleanupUser(api: ApiHarness, id: string, email: string): Promise<void> {
  const { keys } = await api.db.kv.list();
  const doomed = await Promise.all(
    keys.map(async ({ name }) => {
      if (name === `active-sessions-${id}` || name === `revoked-sessions-before-${id}`) {
        return name;
      }

      const record = parseSessionRecord(await api.db.kv.get(name));
      return record?.session?.userId === id || record?.user?.email === email ? name : null;
    }),
  );

  await Promise.all(
    doomed.filter((name): name is string => name !== null).map((name) => api.db.kv.delete(name)),
  );
  await clientFor(api, adminCookie)(`/api/admin/users/${id}`, { method: "DELETE" });
}

/** A revoked session still answers get-session with 200 and a null body. */
async function expectSessionGone(response: Response): Promise<void> {
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toBeNull();
}

test.beforeAll(async ({ api }) => {
  const signIn = await api.signIn("admin@example.com");
  expect(signIn.status).toBe(200);
  adminCookie = cookieHeader(signIn);
  await api.enableTwoFactor("admin@example.com");

  // The admin session is kept as an explicit cookie string for the whole file.
  // Enable 2FA exactly once: re-signing in as admin would only yield a 2FA challenge.
  api.clearSession();
});

describe("session cookie is the only client credential", () => {
  test("session cookies are HttpOnly, SameSite=Lax, Path=/ and carry a random token", async ({
    api,
  }) => {
    const signIn = await signInRaw(api, STAFF_EMAIL);
    expect(signIn.response.status).toBe(200);

    const setCookies = signIn.response.headers.getSetCookie();
    const sessionCookie = expectRow(
      setCookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`)),
    );

    expect(sessionCookie).toMatch(/;\s*Path=\/(?:;|$)/iu);
    expect(sessionCookie).toMatch(/;\s*HttpOnly(?:;|$)/iu);
    expect(sessionCookie).toMatch(/;\s*SameSite=Lax(?:;|$)/iu);
    expect(sessionCookie).toMatch(/;\s*Max-Age=604800(?:;|$)/iu);

    // Better Auth derives Secure from the http://localhost baseURL used here.
    // On an https baseURL the same cookie would be `__Secure-` prefixed and Secure.
    expect(sessionCookie).not.toMatch(/;\s*Secure(?:;|$)/iu);

    // `storeSessionInDatabase=false` and no cookie cache: KV is the sole authority.
    expect(setCookies.some((value) => value.startsWith("better-auth.session_data="))).toBe(false);
    expect(await api.db.kv.get(signIn.token)).not.toBeNull();

    expect(signIn.token).toMatch(/^[A-Za-z0-9_-]{32,}$/u);
    expect(signIn.cookie).toContain(`${SESSION_COOKIE}=${signIn.token}.`);
    expect(signIn.cookie).not.toContain(await userIdFor(api, STAFF_EMAIL));
    expect(signIn.cookie).not.toContain(STAFF_EMAIL);
  });

  test("sign-in rotates the token and ignores an attacker-supplied session cookie", async ({
    api,
  }) => {
    const first = await signInRaw(api, STAFF_EMAIL);
    const second = await signInRaw(api, STAFF_EMAIL, {
      cookie: `${SESSION_COOKIE}=attacker-fixed-value-00000000000000`,
    });

    expect(second.response.status).toBe(200);
    expect(second.token).not.toBe(first.token);
    expect(second.cookie).not.toContain("attacker-fixed-value");

    // Both sessions stay valid: each sign-in creates a fresh KV record rather
    // than reusing a client-chosen id. Fixation is prevented by server-side
    // generation of an unpredictable token, not by invalidating the older one.
    expect(await api.db.kv.get(first.token)).not.toBeNull();
    expect(await api.db.kv.get(second.token)).not.toBeNull();
    const firstSession = await parseJson<SessionBody>(
      await clientFor(api, first.cookie)("/api/auth/get-session"),
    );
    const secondSession = await parseJson<SessionBody>(
      await clientFor(api, second.cookie)("/api/auth/get-session"),
    );

    expect(firstSession.session).toMatchObject({ token: first.token });
    expect(secondSession.session).toMatchObject({ token: second.token });
  });

  test("sign-out deletes the KV session and the stale cookie is rejected", async ({ api }) => {
    const signIn = await signInRaw(api, STAFF_EMAIL);
    const staffId = await userIdFor(api, STAFF_EMAIL);

    expect(await api.db.kv.get(signIn.token)).not.toBeNull();
    expect(await api.db.kv.get(`active-sessions-${staffId}`)).not.toBeNull();

    const asStaff = clientFor(api, signIn.cookie);
    const signOut = await asStaff("/api/auth/sign-out", { method: "POST" });
    expect(signOut.status).toBe(200);
    await expect(signOut.json()).resolves.toMatchObject({ success: true });

    expect(await api.db.kv.get(signIn.token)).toBeNull();
    // Other staff sessions from earlier tests keep the index, but this token is gone.
    expect((await api.db.kv.get(`active-sessions-${staffId}`)) ?? "").not.toContain(signIn.token);

    // The harness cookie variable is not auto-cleared; replay it explicitly.
    const stale = await asStaff("/api/admin/users");
    expect(stale.status).toBe(401);
    await expect(stale.json()).resolves.toMatchObject({ error: { code: "unauthorized" } });
  });
});

describe("privilege and enrollment changes are authoritative on the next request", () => {
  test("promotion and demotion immediately revoke the user's existing sessions", async ({
    api,
  }) => {
    const admin = clientFor(api, adminCookie);
    const email = `sec-role-${Date.now()}@example.com`;
    const created = await createUser(admin, email, "user");
    onTestFinished(() => cleanupUser(api, created.id, email));

    const initial = await signInRaw(api, email, { password: PASSWORD });
    const denied = await clientFor(api, initial.cookie)("/api/admin/users");
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ error: { code: "forbidden" } });

    const promote = await admin(`/api/admin/users/${created.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ role: "admin" }),
    });
    expect(promote.status).toBe(200);

    // The admin route revokes sessions after a role change (admin-users.ts), so
    // the old cookie dies on the very next request instead of serving a stale role.
    await expectSessionGone(await clientFor(api, initial.cookie)("/api/auth/get-session"));
    expect(await api.db.kv.get(initial.token)).toBeNull();
    const revoked = await clientFor(api, initial.cookie)("/api/admin/users");
    expect(revoked.status).toBe(401);

    // A fresh session for the promoted account still owes 2FA. Enrolling
    // refreshes that KV record in place, so the same cookie gains access.
    const promoted = await signInRaw(api, email, { password: PASSWORD });
    const asPromoted = clientFor(api, promoted.cookie);
    const gated = await asPromoted("/api/admin/users");
    expect(gated.status).toBe(403);
    await expect(gated.json()).resolves.toMatchObject({
      error: { code: "two_factor_required" },
    });

    await api.enableTwoFactor(email);
    const allowed = await asPromoted("/api/admin/users");
    expect(allowed.status).toBe(200);

    const demote = await admin(`/api/admin/users/${created.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ role: "user" }),
    });
    expect(demote.status).toBe(200);
    await expectSessionGone(await asPromoted("/api/auth/get-session"));
    const after = await asPromoted("/api/admin/users");
    expect(after.status).toBe(401);
    expect(await userRowFor(api, created.id)).toMatchObject({ role: "user" });
  });

  test("a new admin is gated until 2FA enrollment, then the same session is allowed", async ({
    api,
  }) => {
    const admin = clientFor(api, adminCookie);
    const email = `sec-2fa-admin-${Date.now()}@example.com`;
    const created = await createUser(admin, email, "admin");
    onTestFinished(() => cleanupUser(api, created.id, email));

    const signed = await signInRaw(api, email, { password: PASSWORD });
    expect(signed.response.status).toBe(200);
    const asNewAdmin = clientFor(api, signed.cookie);

    const gated = await asNewAdmin("/api/admin/users");
    expect(gated.status).toBe(403);
    await expect(gated.json()).resolves.toMatchObject({
      error: { code: "two_factor_required" },
    });

    await api.enableTwoFactor(email);
    expect(await userRowFor(api, created.id)).toMatchObject({ twoFactorEnabled: 1 });

    // Same cookie string: the KV session record, not a cookie cache, is re-read.
    const allowed = await asNewAdmin("/api/admin/users");
    expect(allowed.status).toBe(200);
    const body = await parseJson<{ data?: { users?: UserDto[] } }>(allowed);
    expect(body.data?.users?.map((user) => user.id)).toContain(created.id);
  });

  test("2FA enrollment does not let a staff user escalate to admin", async ({ api }) => {
    const admin = clientFor(api, adminCookie);
    const email = `sec-2fa-staff-${Date.now()}@example.com`;
    const created = await createUser(admin, email, "event_staff");
    onTestFinished(() => cleanupUser(api, created.id, email));

    const signed = await signInRaw(api, email, { password: PASSWORD });
    const asStaff = clientFor(api, signed.cookie);
    const gated = await asStaff("/api/admin/users");
    expect(gated.status).toBe(403);
    await expect(gated.json()).resolves.toMatchObject({
      error: { code: "two_factor_required" },
    });

    await api.enableTwoFactor(email);
    const enrolled = await asStaff("/api/admin/users");
    expect(enrolled.status).toBe(403);
    await expect(enrolled.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(await userRowFor(api, created.id)).toMatchObject({
      role: "event_staff",
      twoFactorEnabled: 1,
    });
  });
});

describe("banned account handling", () => {
  test("a user banned in D1 cannot open a new session", async ({ api }) => {
    const admin = clientFor(api, adminCookie);
    const email = `sec-banned-${Date.now()}@example.com`;
    const created = await createUser(admin, email, "user");
    onTestFinished(async () => {
      await api.db.app
        .prepare("UPDATE user SET banned = 0, ban_reason = NULL WHERE id = ?")
        .bind(created.id)
        .run();
      await cleanupUser(api, created.id, email);
    });

    const healthy = await signInRaw(api, email, { password: PASSWORD });
    expect(healthy.response.status).toBe(200);

    await api.db.app
      .prepare("UPDATE user SET banned = 1, ban_reason = ? WHERE id = ?")
      .bind("security test", created.id)
      .run();

    const blocked = await signInRaw(api, email, { password: PASSWORD });
    expect(blocked.response.status).toBe(403);
    await expect(blocked.response.json()).resolves.toMatchObject({ code: "BANNED_USER" });
  });

  test.fails("a user banned in D1 loses an already-active session", async ({ api }) => {
    // Known gap (reproduction): create an admin, sign in, enable 2FA, confirm
    // GET /api/admin/users is 200, then `UPDATE user SET banned = 1` in APP_DB.
    // The same cookie still returns 200 because getSession reads the cached
    // `banned: false` user from KV and never re-reads D1. New sign-ins are
    // correctly blocked (see the preceding test). This assertion is kept strict
    // on purpose; it flips to passing when the ban is made authoritative.
    const admin = clientFor(api, adminCookie);
    const email = `sec-banned-active-${Date.now()}@example.com`;
    const created = await createUser(admin, email, "admin");
    onTestFinished(async () => {
      await api.db.app
        .prepare("UPDATE user SET banned = 0, ban_reason = NULL WHERE id = ?")
        .bind(created.id)
        .run();
      await cleanupUser(api, created.id, email);
    });

    const signed = await signInRaw(api, email, { password: PASSWORD });
    await api.enableTwoFactor(email);
    const asBanned = clientFor(api, signed.cookie);
    const before = await asBanned("/api/admin/users");
    expect(before.status).toBe(200);

    await api.db.app.prepare("UPDATE user SET banned = 1 WHERE id = ?").bind(created.id).run();

    const after = await asBanned("/api/admin/users");
    expect(after.status).toBe(401);
  });
});
