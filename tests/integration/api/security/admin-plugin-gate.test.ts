/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are parsed in tests. */
import { describe, expect, onTestFinished } from "vitest";

import { JSON_HEADERS, PASSWORD } from "../../helpers/constants";
import { test, type ApiHarness } from "../harness";

let adminCookie = "";

type Role = "user" | "admin" | "event_staff";
type SessionClient = (path: string, init?: RequestInit) => Promise<Response>;

interface UserDto {
  id: string;
  email: string;
}

function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

/** The harness injects its own cookie, so callers are cleared before explicit clients are used. */
function clientFor(api: ApiHarness, cookie: string): SessionClient {
  return (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    return api.request(path, { ...init, headers });
  };
}

async function signInRaw(
  api: ApiHarness,
  email: string,
  password = "dev-password",
): Promise<{ cookie: string; status: number }> {
  const response = await api.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  });

  return { cookie: cookieHeader(response), status: response.status };
}

function expectUser(user: UserDto | undefined): UserDto {
  expect(user?.id).toBeTruthy();

  if (user === undefined) {
    throw new Error("Expected a created user");
  }

  return user;
}

async function createUser(admin: SessionClient, email: string, role: Role): Promise<UserDto> {
  const response = await admin("/api/admin/users", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: "Gate Test Person", email, password: PASSWORD, role }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data?: { user?: UserDto } };
  return expectUser(body.data?.user);
}

async function cleanupUser(api: ApiHarness, id: string) {
  await api.db.app.prepare("DELETE FROM two_factor WHERE user_id = ?").bind(id).run();
  await api.db.app.prepare("DELETE FROM session WHERE user_id = ?").bind(id).run();
  await api.db.app.prepare("DELETE FROM account WHERE user_id = ?").bind(id).run();
  await api.db.app.prepare("DELETE FROM user WHERE id = ?").bind(id).run();
}

/** The seeded admin is enrolled once; signing in again would ask for a code. */
test.beforeAll(async ({ api }) => {
  const signIn = await api.signIn("admin@example.com");
  expect(signIn.status).toBe(200);
  adminCookie = cookieHeader(signIn);
  await api.enableTwoFactor("admin@example.com");
  api.clearSession();
});

function enrolledAdmin(api: ApiHarness): SessionClient {
  return clientFor(api, adminCookie);
}

describe("Better Auth's raw admin API", () => {
  test("is not routable, so it cannot bypass the application's admin API", async ({ api }) => {
    const admin = enrolledAdmin(api);

    const requests = [
      ["/api/auth/admin/list-users", { method: "GET" }],
      ["/api/auth/admin/list-users", { method: "PUT" }],
      [
        "/api/auth/admin/create-user",
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({}) },
      ],
      [
        "/api/auth/admin/set-role",
        { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({}) },
      ],
    ] as const;
    const responses = await Promise.all(requests.map(([path, init]) => admin(path, init)));

    for (const response of responses) {
      // The explicit auth router does not mount Better Auth's raw admin
      // endpoints, so every method falls through to the API 404 handler.
      expect(response.status).toBe(404);
    }
  });

  test("enforces the two-factor gate on the application admin API", async ({ api }) => {
    // Local seed accounts opt out; make this one require enrollment for the test.
    await api.db.app
      .prepare("UPDATE user SET two_factor_required = 1 WHERE email = ?")
      .bind("staff@example.com")
      .run();
    onTestFinished(async () => {
      await api.db.app
        .prepare("UPDATE user SET two_factor_required = 0 WHERE email = ?")
        .bind("staff@example.com")
        .run();
    });

    const staff = await signInRaw(api, "staff@example.com");
    expect(staff.status).toBe(200);
    const asStaff = clientFor(api, staff.cookie);

    const appRoute = await asStaff("/api/admin/users");
    expect(appRoute.status).toBe(403);
    await expect(appRoute.json()).resolves.toMatchObject({
      error: { code: "two_factor_required" },
    });
  });

  test("gates comma-separated roles that include a staff role", async ({ api }) => {
    const admin = enrolledAdmin(api);
    const email = `multi-role-${crypto.randomUUID()}@example.com`;
    const created = await createUser(admin, email, "user");
    onTestFinished(() => cleanupUser(api, created.id));

    // Simulate a multi-role value (Better Auth stores arrays comma-joined).
    await api.db.app
      .prepare("UPDATE user SET role = ? WHERE id = ?")
      .bind("user,admin", created.id)
      .run();

    const signed = await signInRaw(api, email, PASSWORD);
    expect(signed.status).toBe(200);
    const asMultiRole = clientFor(api, signed.cookie);

    const appRoute = await asMultiRole("/api/admin/users");
    expect(appRoute.status).toBe(403);
    await expect(appRoute.json()).resolves.toMatchObject({
      error: { code: "two_factor_required" },
    });
  });
});
