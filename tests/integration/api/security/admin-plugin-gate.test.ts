/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are parsed in tests. */
import { describe, expect } from "vitest";

import { JSON_HEADERS } from "../../helpers/constants";
import { test, type ApiHarness } from "../harness";

let adminCookie = "";

type SessionClient = (path: string, init?: RequestInit) => Promise<Response>;

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

/** The seeded admin is enrolled once; signing in again would ask for a code. */
test.beforeAll(async ({ api }) => {
  const signIn = await api.signIn("admin@example.com");
  expect(signIn.status).toBe(200);
  adminCookie = cookieHeader(signIn);
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
});
