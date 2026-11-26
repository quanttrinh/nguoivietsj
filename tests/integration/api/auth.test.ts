/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are asserted in tests. */
import { describe, expect } from "vitest";

import { test } from "./harness";

describe("auth and authorization", () => {
  test.skip("rejects a wrong password", async ({ api }) => {
    const response = await api.signIn("admin@example.com", "wrong-password");

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  test("signs in a seeded account and exposes the session", async ({ api }) => {
    const signIn = await api.signIn("admin@example.com");
    const session = await api.request("/api/auth/get-session");
    const body = (await session.json()) as {
      user?: { email?: string; role?: string };
    };

    expect(signIn.status).toBe(200);
    expect(body.user?.email).toBe("admin@example.com");
    expect(body.user?.role).toBe("admin");
  });

  test("rejects unauthenticated admin requests", async ({ api }) => {
    api.clearSession();
    const response = await api.request("/api/admin/users");

    expect(response.status).toBe(401);
  });

  test("blocks staff without two-factor enrollment", async ({ api }) => {
    await api.signIn("staff@example.com");
    const response = await api.request("/api/admin/users");

    expect(response.status).toBe(403);
  });

  test("allows an enrolled admin", async ({ api }) => {
    await api.signIn("admin@example.com");
    await api.enableTwoFactor("admin@example.com");
    const response = await api.request("/api/admin/users");
    const body = (await response.json()) as { data?: { users?: { email: string }[] } };

    expect(response.status).toBe(200);
    expect(body.data?.users?.some((user) => user.email === "admin@example.com")).toBe(true);
  });

  test("denies a staff account from user management", async ({ api }) => {
    await api.signIn("staff@example.com");
    await api.enableTwoFactor("staff@example.com");
    const response = await api.request("/api/admin/users");

    expect(response.status).toBe(403);
  });
});
