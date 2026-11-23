import { describe, expect, test } from "vitest";

import { accountKey } from "../../../../src/auth/server/rate-limit-keys";

const SCOPE = "auth:send-otp:account";

function requestWithCookie(cookie: string): Request {
  return new Request("http://localhost/api/auth/two-factor/send-otp", {
    headers: { cookie },
  });
}

describe("accountKey", () => {
  test("keys on the signed Better Auth session token", () => {
    expect(
      accountKey(SCOPE, requestWithCookie("other=1; better-auth.session_token=abc123.signature")),
    ).toBe(`${SCOPE}:abc123`);
  });

  test("keys on the two-factor challenge cookie when there is no session", () => {
    expect(
      accountKey(SCOPE, requestWithCookie("better-auth.two_factor=challenge-456.signature")),
    ).toBe(`${SCOPE}:challenge-456`);
  });

  test("prefers the session cookie when both cookies are present", () => {
    expect(
      accountKey(
        SCOPE,
        requestWithCookie(
          "better-auth.two_factor=challenge-456.sig; better-auth.session_token=abc123.sig",
        ),
      ),
    ).toBe(`${SCOPE}:abc123`);
  });

  test("accepts the secure session cookie prefix", () => {
    expect(
      accountKey(SCOPE, requestWithCookie("__Secure-better-auth.session_token=abc123.sig")),
    ).toBe(`${SCOPE}:abc123`);
  });

  test("returns null without a usable cookie", () => {
    expect(accountKey(SCOPE, requestWithCookie("other=1"))).toBeNull();
    expect(accountKey(SCOPE, requestWithCookie("better-auth.session_token=.sig"))).toBeNull();
    expect(
      accountKey(SCOPE, new Request("http://localhost/api/auth/two-factor/send-otp")),
    ).toBeNull();
  });
});
