/* oxlint-disable typescript/no-unsafe-type-assertion -- API bodies are parsed in tests. */
import { describe, expect, onTestFinished } from "vitest";

import { JSON_HEADERS } from "../../helpers/constants";
import { test, type ApiHarness } from "../harness";

const SESSION_COOKIE = "better-auth.session_token";

interface SessionBody {
  user?: { email?: string };
}

interface EnableBody {
  method?: string;
  totpURI?: string;
  backupCodes?: string[];
}

interface TwoFactorEmailJob {
  code: string;
  email: string;
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

  test.skip("a two-factor email challenge enables two-factor authentication end-to-end", async ({
    api,
  }) => {
    api.clearSession();
    const mailtrapUrl = api.env.MAILTRAP_API_URL;
    const mailtrapToken = api.env.MAILTRAP_API_TOKEN;
    onTestFinished(() => {
      api.env.MAILTRAP_API_URL = mailtrapUrl;
      api.env.MAILTRAP_API_TOKEN = mailtrapToken;
    });
    api.env.MAILTRAP_API_URL = "https://mailtrap.test/api/send";
    api.env.MAILTRAP_API_TOKEN = "test-mailtrap-token";

    const signIn = await api.signIn("staff@example.com");
    expect(signIn.status).toBe(200);

    api.queue.send.mockClear();
    const enable = await post(api, "/api/auth/two-factor/enable", { otp: "123456" });
    const enabled = (await enable.json()) as EnableBody;

    expect(enable.status).toBe(200);
    expect(enabled.method).toBe("totp");
    expect(enabled.totpURI).toContain("otpauth://");
    expect(enabled.backupCodes?.length).toBeGreaterThan(0);

    const send = await post(api, "/api/auth/two-factor/send-otp");
    expect(send.status).toBe(200);
    await expect(send.json()).resolves.toMatchObject({ status: true });

    const job = api.queue.send.mock.calls[0]?.[0] as TwoFactorEmailJob | undefined;
    expect.assert(job !== undefined, "expected a queued two-factor email");
    expect(job.email).toBe("staff@example.com");

    const verify = await post(api, "/api/auth/two-factor/verify-otp", { code: job.code });
    const verified = (await verify.json()) as { user?: { email?: string } };

    expect(verify.status).toBe(200);
    expect(verified.user?.email).toBe("staff@example.com");
    expect(
      verify.headers.getSetCookie().some((value) => value.startsWith(`${SESSION_COOKIE}=`)),
    ).toBe(true);

    const row = await api.db.app
      .prepare("SELECT two_factor_enabled AS enabled FROM user WHERE email = ?")
      .bind("staff@example.com")
      .first<{ enabled: number }>();
    expect(row?.enabled).toBe(1);

    // A signed-in request also exercises the account-scoped limiter.
    const totp = await post(api, "/api/auth/two-factor/verify-totp", { code: "000000" });
    expect(totp.status).toBeGreaterThanOrEqual(400);
  });

  test.skip("two-factor verify endpoints reject invalid codes without a session", async ({
    api,
  }) => {
    api.clearSession();

    const responses = await Promise.all(
      [
        "/api/auth/two-factor/verify-otp",
        "/api/auth/two-factor/verify-totp",
        "/api/auth/two-factor/verify-backup-code",
      ].map((path) => post(api, path, { code: "000000" })),
    );

    const results = await Promise.all(
      responses.map(async (response) => ({
        status: response.status,
        code: await errorCode(response),
      })),
    );

    for (const result of results) {
      expect(result.status).toBe(401);
      expect(result.code).toBeTruthy();
    }
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
