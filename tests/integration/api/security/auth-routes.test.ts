/* oxlint-disable typescript/no-unsafe-type-assertion -- API bodies are parsed in tests. */
import { describe, expect } from "vitest";

import { JSON_HEADERS } from "../../helpers/constants";
import { test, type ApiHarness } from "../harness";

const SESSION_COOKIE = "better-auth.session_token";

interface SessionBody {
  user?: { email?: string };
}

function errorCode(response: Response) {
  return response
    .json()
    .then((body: { code?: string; error?: { code?: string } }) => body.error?.code ?? body.code);
}

function post(
  api: ApiHarness,
  path: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return api.request(path, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

describe("explicit Better Auth routes", () => {
  test("sign-in sets a session cookie and get-session returns the user", async ({ api }) => {
    api.clearSession();
    const signIn = await api.signIn("admin@example.com");

    expect(signIn.status).toBe(200);
    expect(
      signIn.headers.getSetCookie().some((value) => value.startsWith(`${SESSION_COOKIE}=`)),
    ).toBe(true);

    const session = await api.request("/api/auth/get-session");
    const body = (await session.json()) as SessionBody;

    expect(session.status).toBe(200);
    expect(session.headers.get("cache-control")).toBe("no-store");
    expect(body.user?.email).toBe("admin@example.com");
  });

  test("get-session returns null when there is no session", async ({ api }) => {
    api.clearSession();
    const response = await api.request("/api/auth/get-session");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
  });

  test("sign-out clears the session cookie", async ({ api }) => {
    api.clearSession();
    const signIn = await api.signIn("admin@example.com");
    expect(signIn.status).toBe(200);

    const signOut = await post(api, "/api/auth/sign-out");

    expect(signOut.status).toBe(200);
    await expect(signOut.json()).resolves.toMatchObject({ success: true });
    expect(
      signOut.headers.getSetCookie().some((value) => value.startsWith(`${SESSION_COOKIE}=;`)),
    ).toBe(true);

    api.clearSession();
    const session = await api.request("/api/auth/get-session");
    await expect(session.json()).resolves.toBeNull();
  });

  test("malformed JSON bodies reach Better Auth validation instead of throwing", async ({
    api,
  }) => {
    const response = await api.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{not-json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toHaveProperty("code");
  });

  test("non-object JSON bodies are treated as an empty body", async ({ api }) => {
    const response = await api.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify([1, 2, 3]),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toHaveProperty("code");
  });

  test.for([
    { path: "/api/auth/admin/list-users", method: "GET" },
    { path: "/api/auth/admin/list-users", method: "POST" },
    { path: "/api/auth/admin/list-users", method: "PUT" },
    { path: "/api/auth/admin/list-users", method: "DELETE" },
    { path: "/api/auth/forget-password", method: "GET" },
    { path: "/api/auth/forget-password", method: "POST" },
    { path: "/api/auth/sign-up/email", method: "POST" },
    { path: "/api/auth/send-otp", method: "POST" },
    { path: "/api/auth/whatever", method: "GET" },
    { path: "/api/auth/whatever", method: "POST" },
  ] as const)("unlisted $method $path returns 404", async (probe, { api }) => {
    const response = await api.request(probe.path, {
      method: probe.method,
      ...(probe.method === "GET"
        ? {}
        : { headers: JSON_HEADERS, body: JSON.stringify({ email: "admin@example.com" }) }),
    });

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe("not_found");
  });
});
