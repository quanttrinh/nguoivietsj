/* oxlint-disable typescript/no-unsafe-type-assertion -- API bodies are parsed in tests. */
import { describe, expect, onTestFinished } from "vitest";

import { JSON_HEADERS } from "../../helpers/constants";
import { test, type ApiHarness } from "../harness";

const ACCOUNT_SCOPE = "auth:send-otp:account:";

async function errorCode(response: Response) {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

function recordKeys(api: ApiHarness): string[] {
  const keys: string[] = [];
  const original = api.env.AUTH_SEND_OTP_RATE_LIMITER;
  onTestFinished(() => {
    api.env.AUTH_SEND_OTP_RATE_LIMITER = original;
  });
  api.env.AUTH_SEND_OTP_RATE_LIMITER = {
    limit: ({ key }: { key: string }) => {
      keys.push(key);
      return Promise.resolve({ success: !key.startsWith(ACCOUNT_SCOPE) });
    },
  };
  return keys;
}

describe("two-factor OTP rate limiting", () => {
  test("keys the per-account bucket on the signed-in account", async ({ api }) => {
    api.clearSession();
    const keys = recordKeys(api);

    const signIn = await api.signIn("staff@example.com");
    expect(signIn.status).toBe(200);
    expect(
      signIn.headers.getSetCookie().some((value) => value.startsWith("better-auth.session_token=")),
    ).toBe(true);

    const response = await api.request("/api/auth/two-factor/send-otp", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    });

    expect(keys.some((key) => key.startsWith(ACCOUNT_SCOPE))).toBe(true);
    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe("rate_limited");
  });

  test("keys the per-account bucket on a two-factor challenge cookie", async ({ api }) => {
    api.clearSession();
    const keys = recordKeys(api);

    const response = await api.request("/api/auth/two-factor/send-otp", {
      method: "POST",
      headers: {
        ...JSON_HEADERS,
        cookie: "better-auth.two_factor=challenge-456.signature",
      },
      body: JSON.stringify({}),
    });

    expect(keys).toContain(`${ACCOUNT_SCOPE}challenge-456`);
    // The limiter runs before Better Auth rejects the bogus challenge.
    expect(response.status).toBe(429);
  });

  test.for([
    { path: "/api/auth/sign-in/email", binding: "AUTH_SIGN_IN_RATE_LIMITER" },
    { path: "/api/auth/two-factor/send-otp", binding: "AUTH_SEND_OTP_RATE_LIMITER" },
  ] as const)("denies $path when its rate limiter is unavailable", async (flow, { api }) => {
    api.clearSession();
    const original = api.env[flow.binding];
    onTestFinished(() => {
      api.env[flow.binding] = original;
    });
    api.env[flow.binding] = undefined;

    const response = await api.request(flow.path, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: "admin@example.com", password: "dev-password" }),
    });

    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe("rate_limited");
  });
});
