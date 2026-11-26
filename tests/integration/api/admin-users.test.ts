/* oxlint-disable typescript/no-unsafe-type-assertion, eslint/max-lines, eslint/no-await-in-loop -- API bodies, module mocks, and sequential route checks are asserted in tests. */
import { APIError } from "better-auth/api";
import { Hono, type Context, type Next } from "hono";
import { describe, expect, vi } from "vitest";

import { JSON_HEADERS, PASSWORD } from "../helpers/constants";
import type { TestDatabase } from "../helpers/d1";
import { parseJson } from "../helpers/http";
import { test, type ApiHarness } from "./harness";

interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface ListData {
  data?: {
    users?: UserDto[];
  };
  meta?: {
    pagination?: {
      page?: number;
      pageSize?: number;
      total?: number;
      totalPages?: number;
    };
  };
}

interface ErrorData {
  error?: {
    code?: string;
    message?: string;
  };
}

interface CreateData {
  data?: {
    user?: UserDto;
  };
}

/** Sign in with 2FA temporarily disabled, then re-enroll to get a valid session. */
async function signInAs(api: ApiHarness, email: string) {
  await api.db.app
    .prepare("UPDATE user SET two_factor_enabled = 0 WHERE email = ?")
    .bind(email)
    .run();
  api.clearSession();
  await api.signIn(email);
  await api.enableTwoFactor(email);
}

async function userIdFor(db: TestDatabase, email: string) {
  const row = await db.app
    .prepare("SELECT id FROM user WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  expect(row).toBeDefined();
  return row?.id ?? "";
}

async function createUser(
  api: ApiHarness,
  email: string,
  role: "user" | "admin" | "event_staff" | "event_checkin" = "user",
) {
  const response = await api.request("/api/admin/users", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: "Provisioned", email, password: PASSWORD, role }),
  });
  expect(response.status).toBe(201);
  const body = await parseJson<CreateData>(response);
  expect(body.data?.user?.email).toBe(email);
  return body.data?.user?.id ?? "";
}

async function removeUser(api: ApiHarness, id: string) {
  await api.request(`/api/admin/users/${id}`, { method: "DELETE" });
}

test.beforeAll(async ({ api }) => {
  await api.signIn("admin@example.com");
  await api.enableTwoFactor("admin@example.com");
});

describe("admin users list", () => {
  test("returns every seeded user with pagination metadata", async ({ api }) => {
    const response = await api.request("/api/admin/users");
    const body = await parseJson<ListData>(response);

    expect(response.status).toBe(200);
    expect(body.data?.users?.map((user) => user.email)).toEqual(
      expect.arrayContaining(["admin@example.com", "staff@example.com"]),
    );
    const admin = body.data?.users?.find((user) => user.email === "admin@example.com");
    expect(admin).toMatchObject({ role: "admin", name: "Admin" });
    expect(admin?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    const total = body.meta?.pagination?.total ?? 0;
    expect(body.meta?.pagination).toMatchObject({
      page: 1,
      pageSize: 25,
      total,
      totalPages: Math.max(1, Math.ceil(total / 25)),
    });
  });

  test("returns an empty page past the end of the list", async ({ api }) => {
    const response = await api.request("/api/admin/users?page=2");
    const body = await parseJson<ListData>(response);

    expect(response.status).toBe(200);
    expect(body.data?.users).toEqual([]);
    expect(body.meta?.pagination?.page).toBe(2);
  });

  test("searches by email with the default field", async ({ api }) => {
    const response = await api.request("/api/admin/users?q=admin");
    const body = await parseJson<ListData>(response);

    expect(response.status).toBe(200);
    expect(body.data?.users?.map((user) => user.email)).toEqual(["admin@example.com"]);
  });

  test("searches by name when field is name", async ({ api }) => {
    const response = await api.request("/api/admin/users?q=staff&field=name");
    const body = await parseJson<ListData>(response);

    expect(response.status).toBe(200);
    expect(body.data?.users?.map((user) => user.email)).toEqual(["staff@example.com"]);
  });

  test("trims surrounding whitespace from the search query", async ({ api }) => {
    const response = await api.request(`/api/admin/users?q=${encodeURIComponent("  admin  ")}`);
    const body = await parseJson<ListData>(response);

    expect(response.status).toBe(200);
    expect(body.data?.users?.map((user) => user.email)).toEqual(["admin@example.com"]);
  });

  test("accepts a query longer than the email limit", async ({ api }) => {
    const response = await api.request(`/api/admin/users?q=${"a".repeat(300)}`);
    const body = await parseJson<ListData>(response);

    expect(response.status).toBe(200);
    expect(body.data?.users).toEqual([]);
  });

  test("filters by role", async ({ api }) => {
    const admin = await parseJson<ListData>(await api.request("/api/admin/users?role=admin"));
    const staff = await parseJson<ListData>(await api.request("/api/admin/users?role=event_staff"));

    expect(admin.data?.users?.every((user) => user.role === "admin")).toBe(true);
    expect(admin.data?.users?.map((user) => user.email)).toContain("admin@example.com");
    expect(staff.data?.users?.map((user) => user.email)).toEqual(["staff@example.com"]);
  });

  test.for([
    { label: "zero page", query: "page=0" },
    { label: "negative page", query: "page=-1" },
    { label: "non-integer page", query: "page=abc" },
    { label: "unknown field", query: "field=phone" },
    { label: "unknown role", query: "role=superadmin" },
  ])("rejects an invalid list query ($label)", async ({ query }, { api }) => {
    const response = await api.request(`/api/admin/users?${query}`);

    expect(response.status).toBe(400);
    const errorBody = await parseJson<ErrorData>(response);
    expect(errorBody.error?.code).toBeTruthy();
  });
});

describe("admin user creation", () => {
  test("creates a user and returns its DTO", async ({ api }) => {
    const email = `created-${Date.now()}@example.com`;
    const id = await createUser(api, email, "user");
    try {
      const row = await api.db.app
        .prepare("SELECT name, email, role FROM user WHERE id = ?")
        .bind(id)
        .first<{ name: string; email: string; role: string }>();
      expect(row).toMatchObject({ name: "Provisioned", email, role: "user" });
    } finally {
      await removeUser(api, id);
    }
  });

  test("creates an admin user", async ({ api }) => {
    const email = `admin-created-${Date.now()}@example.com`;
    const id = await createUser(api, email, "admin");
    try {
      const response = await api.request("/api/admin/users?role=admin");
      const body = await parseJson<ListData>(response);
      expect(body.data?.users?.map((user) => user.email)).toContain(email);
    } finally {
      await removeUser(api, id);
    }
  });

  test("maps a duplicate-email Better Auth error through the fallback", async ({ api }) => {
    const response = await api.request("/api/admin/users", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: "Duplicate",
        email: "admin@example.com",
        password: PASSWORD,
        role: "user",
      }),
    });
    const body = await parseJson<ErrorData>(response);

    // Better Auth reports the named status "BAD_REQUEST", which is mapped to 400.
    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    expect(body.error?.message).toBeTruthy();
  });

  test.for([
    { label: "missing name", body: { email: "x@example.com", password: PASSWORD, role: "user" } },
    { label: "missing email", body: { name: "X", password: PASSWORD, role: "user" } },
    {
      label: "short password",
      body: { name: "X", email: "x@example.com", password: "short", role: "user" },
    },
    {
      label: "invalid email",
      body: { name: "X", email: "not-an-email", password: PASSWORD, role: "user" },
    },
    {
      label: "unknown role",
      body: { name: "X", email: "x@example.com", password: PASSWORD, role: "superadmin" },
    },
    { label: "empty body", body: {} },
  ])("rejects an invalid create payload ($label)", async ({ body }, { api }) => {
    const response = await api.request("/api/admin/users", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    const errorBody = await parseJson<ErrorData>(response);
    expect(errorBody.error?.code).toBeTruthy();
  });
});

async function withTarget(api: ApiHarness, run: (id: string) => Promise<void>) {
  const id = await createUser(api, `target-${Date.now()}-${Math.random()}@example.com`);
  try {
    await run(id);
  } finally {
    await removeUser(api, id);
  }
}

describe("admin user updates", () => {
  test("updates a name", async ({ api }) => {
    await withTarget(api, async (id) => {
      const response = await api.request(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: "Renamed" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ data: { updated: true } });
      const row = await api.db.app
        .prepare("SELECT name FROM user WHERE id = ?")
        .bind(id)
        .first<{ name: string }>();
      expect(row?.name).toBe("Renamed");
    });
  });

  test("updates an email", async ({ api }) => {
    await withTarget(api, async (id) => {
      const email = `moved-${Date.now()}@example.com`;
      const response = await api.request(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email }),
      });

      expect(response.status).toBe(200);
      const row = await api.db.app
        .prepare("SELECT email FROM user WHERE id = ?")
        .bind(id)
        .first<{ email: string }>();
      expect(row?.email).toBe(email);
    });
  });

  test("updates a role", async ({ api }) => {
    await withTarget(api, async (id) => {
      const response = await api.request(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ role: "admin" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ data: { updated: true } });
      const row = await api.db.app
        .prepare("SELECT role FROM user WHERE id = ?")
        .bind(id)
        .first<{ role: string }>();
      expect(row?.role).toBe("admin");
    });
  });

  test("updates a password", async ({ api }) => {
    await withTarget(api, async (id) => {
      const before = await api.db.app
        .prepare("SELECT password FROM account WHERE user_id = ?")
        .bind(id)
        .first<{ password: string }>();

      const response = await api.request(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ password: "a-brand-new-password" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ data: { updated: true } });
      const after = await api.db.app
        .prepare("SELECT password FROM account WHERE user_id = ?")
        .bind(id)
        .first<{ password: string }>();
      expect(after?.password).toBeTruthy();
      expect(after?.password).not.toBe(before?.password);
    });
  });

  test("updates every mutable field at once", async ({ api }) => {
    await withTarget(api, async (id) => {
      const email = `combined-${Date.now()}@example.com`;
      const response = await api.request(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          name: "Combined",
          email,
          role: "event_checkin",
          password: PASSWORD,
        }),
      });

      expect(response.status).toBe(200);
      const row = await api.db.app
        .prepare("SELECT name, email, role FROM user WHERE id = ?")
        .bind(id)
        .first<{ name: string; email: string; role: string }>();
      expect(row).toMatchObject({ name: "Combined", email, role: "event_checkin" });
    });
  });

  test("rejects an empty update", async ({ api }) => {
    const adminId = await userIdFor(api.db, "admin@example.com");
    const response = await api.request(`/api/admin/users/${adminId}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    });
    const body = await parseJson<ErrorData>(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("user_update_empty");
  });

  test("rejects changing your own role", async ({ api }) => {
    const adminId = await userIdFor(api.db, "admin@example.com");
    const response = await api.request(`/api/admin/users/${adminId}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ role: "user" }),
    });
    const body = await parseJson<ErrorData>(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("cannot_change_own_role");
  });

  test("maps a missing user to not found", async ({ api }) => {
    const response = await api.request("/api/admin/users/does-not-exist", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Nobody" }),
    });
    const body = await parseJson<ErrorData>(response);

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe("USER_NOT_FOUND");
  });

  test("maps a duplicate email through the fallback", async ({ api }) => {
    await withTarget(api, async (id) => {
      const response = await api.request(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email: "admin@example.com" }),
      });

      expect(response.status).toBe(400);
      const errorBody = await parseJson<ErrorData>(response);
      expect(errorBody.error?.code).toBe("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    });
  });

  test.for([
    { label: "long name", body: { name: "x".repeat(201) } },
    { label: "short password", body: { password: "short" } },
    { label: "invalid email", body: { email: "bad" } },
    { label: "unknown role", body: { role: "superadmin" } },
  ])("rejects an invalid update payload ($label)", async ({ body }, { api }) => {
    const adminId = await userIdFor(api.db, "admin@example.com");
    const response = await api.request(`/api/admin/users/${adminId}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
  });
});

describe("admin user deletion", () => {
  test("removes a user", async ({ api }) => {
    const id = await createUser(api, `remove-${Date.now()}@example.com`);
    const response = await api.request(`/api/admin/users/${id}`, { method: "DELETE" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { removed: true } });
    const row = await api.db.app
      .prepare("SELECT id FROM user WHERE id = ?")
      .bind(id)
      .first<{ id: string }>();
    expect(row).toBeNull();
  });

  test("maps a missing user through the fallback", async ({ api }) => {
    const response = await api.request("/api/admin/users/does-not-exist", { method: "DELETE" });
    const body = await parseJson<ErrorData>(response);

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe("USER_NOT_FOUND");
  });

  test("refuses to remove yourself", async ({ api }) => {
    const adminId = await userIdFor(api.db, "admin@example.com");
    const response = await api.request(`/api/admin/users/${adminId}`, { method: "DELETE" });
    const body = await parseJson<ErrorData>(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("YOU_CANNOT_REMOVE_YOURSELF");
  });
});

function caseInit(method: string): RequestInit {
  return method === "POST" || method === "PATCH"
    ? { method, headers: JSON_HEADERS, body: JSON.stringify({}) }
    : { method };
}

describe("admin users authorization", () => {
  const cases = [
    { label: "list", path: "/api/admin/users", method: "GET" },
    { label: "create", path: "/api/admin/users", method: "POST" },
    { label: "update", path: "/api/admin/users/some-id", method: "PATCH" },
    { label: "delete", path: "/api/admin/users/some-id", method: "DELETE" },
  ] as const;

  test("rejects unauthenticated requests for every route", async ({ api }) => {
    api.clearSession();
    for (const { path, method } of cases) {
      const response = await api.request(path, caseInit(method));

      expect(response.status, `${method} ${path}`).toBe(401);
    }
    await signInAs(api, "admin@example.com");
  });

  test("rejects enrolled staff for every route", async ({ api }) => {
    await signInAs(api, "staff@example.com");
    for (const { path, method } of cases) {
      const response = await api.request(path, caseInit(method));

      expect(response.status, `${method} ${path}`).toBe(403);
      const errorBody = await parseJson<ErrorData>(response);
      expect(errorBody.error?.code).toBe("forbidden");
    }
    await signInAs(api, "admin@example.com");
  });

  test.skip("requires two-factor enrollment for the admin role", async ({ api }) => {
    await api.db.app
      .prepare("UPDATE user SET two_factor_enabled = 0, two_factor_required = 1 WHERE email = ?")
      .bind("admin@example.com")
      .run();
    api.clearSession();
    await api.signIn("admin@example.com");
    const response = await api.request("/api/admin/users");
    expect(response.status).toBe(403);
    const errorBody = await parseJson<ErrorData>(response);
    expect(errorBody.error?.code).toBe("two_factor_required");

    await api.db.app
      .prepare("UPDATE user SET two_factor_required = 0 WHERE email = ?")
      .bind("admin@example.com")
      .run();
    await signInAs(api, "admin@example.com");
  });
});

type ApiMock = Record<string, (...args: unknown[]) => unknown>;

/** Mount a fresh router instance whose auth + middleware are controllable. */
async function mountMockedRouter(
  apiMock: ApiMock,
  user?: { id: string; role?: string },
): Promise<Hono> {
  const actingUser = user ?? { id: "self", role: "admin" };
  vi.doMock("~/auth/server/auth", () => ({ auth: () => ({ api: apiMock }) }));
  vi.doMock("~/auth/server/middleware", () => ({
    requireAuth: (ctx: Context, next: Next) => {
      ctx.set("user", actingUser);
      return next();
    },
    requirePermission: () => (_ctx: Context, next: Next) => next(),
  }));
  vi.resetModules();
  try {
    const { adminUsers } = await import("~/server/routes/admin-users");
    return new Hono().route("/api/admin/users", adminUsers);
  } finally {
    vi.doUnmock("~/auth/server/auth");
    vi.doUnmock("~/auth/server/middleware");
    vi.resetModules();
  }
}

function jsonPost(body: object): RequestInit {
  return { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) };
}

describe("admin users defensive error fallbacks", () => {
  test("revokes sessions before applying a password change", async () => {
    const update = vi.fn(() => Promise.resolve({}));
    const setPassword = vi.fn(() => Promise.resolve({}));
    const app = await mountMockedRouter({
      revokeUserSessions: () => Promise.reject(new Error("session store down")),
      adminUpdateUser: update,
      setUserPassword: setPassword,
    });

    const response = await app.request("http://localhost/api/admin/users/some-user", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ password: PASSWORD }),
    });

    expect(response.status).toBe(500);
    expect(update).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  test("returns user_operation_failed for an unexpected list error", async () => {
    const app = await mountMockedRouter({
      listUsers: () => Promise.reject(new Error("db down")),
    });
    const response = await app.request("http://localhost/api/admin/users");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
      error: { code: "user_operation_failed" },
    });
  });

  test("classifies a thrown non-Error value as user_operation_failed", async () => {
    const app = await mountMockedRouter({
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- exercise the non-Error logging branch.
      listUsers: () => Promise.reject("plain string failure"),
    });
    const response = await app.request("http://localhost/api/admin/users");

    expect(response.status).toBe(500);
    const errorBody = await parseJson<ErrorData>(response);
    expect(errorBody.error?.code).toBe("user_operation_failed");
  });

  test("defaults a missing user role to the plain user role", async () => {
    const app = await mountMockedRouter({
      listUsers: () =>
        Promise.resolve({
          total: 1,
          users: [
            {
              id: "no-role",
              name: "No Role",
              email: "norole@example.com",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          ],
        }),
    });
    const response = await app.request("http://localhost/api/admin/users");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { users: [{ id: "no-role", role: "user" }] },
    });
  });

  test("maps an UNAUTHORIZED API error without a body to 401", async () => {
    const app = await mountMockedRouter({
      createUser: () => Promise.reject(new APIError(401)),
    });
    const response = await app.request(
      "http://localhost/api/admin/users",
      jsonPost({
        name: "X",
        email: "x@example.com",
        password: PASSWORD,
        role: "user",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "user_request_failed" },
    });
  });

  test("preserves a numeric 400 error status", async () => {
    const app = await mountMockedRouter({
      createUser: () => Promise.reject(new APIError(400, { code: "bad_request", message: "nope" })),
    });
    const response = await app.request(
      "http://localhost/api/admin/users",
      jsonPost({
        name: "X",
        email: "x@example.com",
        password: PASSWORD,
        role: "user",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request", message: "nope" },
    });
  });

  test("keeps a provided error code and omits a missing message", async () => {
    const app = await mountMockedRouter({
      createUser: () => Promise.reject(new APIError(403, { code: "custom_denied" })),
    });
    const response = await app.request(
      "http://localhost/api/admin/users",
      jsonPost({
        name: "X",
        email: "x@example.com",
        password: PASSWORD,
        role: "user",
      }),
    );

    expect(response.status).toBe(403);
    const body = await parseJson<ErrorData>(response);
    expect(body.error).toMatchObject({ code: "custom_denied" });
    expect(body.error).toHaveProperty("message", "Something went wrong.");
  });

  test("falls back the code but keeps the message when the body has no code", async () => {
    const app = await mountMockedRouter({
      createUser: () => Promise.reject(new APIError(409, { message: "already present" })),
    });
    const response = await app.request(
      "http://localhost/api/admin/users",
      jsonPost({
        name: "X",
        email: "x@example.com",
        password: PASSWORD,
        role: "user",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "user_request_failed", message: "already present" },
    });
  });

  test("maps an unrecognized error status to 500", async () => {
    const app = await mountMockedRouter({
      createUser: () =>
        Promise.reject(new APIError(418, { code: "teapot", message: "short and stout" })),
    });
    const response = await app.request(
      "http://localhost/api/admin/users",
      jsonPost({
        name: "X",
        email: "x@example.com",
        password: PASSWORD,
        role: "user",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "teapot", message: "short and stout" },
    });
  });

  test("maps an unrecognized named error status to 500", async () => {
    const app = await mountMockedRouter({
      createUser: () =>
        Promise.reject(
          new APIError("EXPECTATION_FAILED", { code: "teapot", message: "short and stout" }),
        ),
    });
    const response = await app.request(
      "http://localhost/api/admin/users",
      jsonPost({
        name: "X",
        email: "x@example.com",
        password: PASSWORD,
        role: "user",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "teapot", message: "short and stout" },
    });
  });

  test("forbids setting a role without the set-role permission", async () => {
    const app = await mountMockedRouter({}, { id: "limited", role: "user" });
    const response = await app.request("http://localhost/api/admin/users/other", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ role: "admin" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
  });

  test("forbids setting a password without the set-password permission", async () => {
    const app = await mountMockedRouter({}, { id: "limited", role: "user" });
    const response = await app.request("http://localhost/api/admin/users/other", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ password: PASSWORD }),
    });

    expect(response.status).toBe(403);
    const errorBody = await parseJson<ErrorData>(response);
    expect(errorBody.error?.code).toBe("forbidden");
  });
});

// Keep last: the change deliberately revokes the acting admin's own session,
// which would invalidate the file-scoped harness for later tests.
describe("admin self password change", () => {
  test("an admin can change their own password", async ({ api }) => {
    const adminId = await userIdFor(api.db, "admin@example.com");
    const response = await api.request(`/api/admin/users/${adminId}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ password: "a-brand-new-password" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { updated: true } });
  });
});
