/* oxlint-disable eslint/max-lines -- middleware coverage needs one focused app per failure mode. */
/* oxlint-disable typescript/no-unsafe-type-assertion -- test responses and env objects are asserted. */
import { Hono } from "hono";
import { describe, expect, test as unitTest, vi } from "vitest";

import {
  bodyEmailKey,
  checkRateLimit,
  clientIdKey,
  clientKey,
  emailKey,
  rateLimit,
  type RateLimitSettings,
} from "../../../src/server/middleware/rate-limit";
import { requireTurnstile } from "../../../src/server/middleware/turnstle";
import { authMessage, resolveAuthLocale } from "../../../src/server/routes/auth";
import { DEFAULT_LOCALE } from "../../../src/shared/i18n";
import { test } from "./harness";

interface LimiterBinding {
  limit: () => Promise<{ success: boolean }>;
}

function testEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return overrides;
}

function testRequest(path = "/", init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

function limiter(result: { success: boolean }): LimiterBinding {
  return { limit: () => Promise.resolve(result) };
}

function settings(overrides: Partial<RateLimitSettings> = {}): RateLimitSettings {
  return {
    limiter: () => limiter({ success: true }),
    scope: "test",
    key: () => "test:key",
    ...overrides,
  };
}

function alwaysFails(): never {
  throw new Error("limiter down");
}

function turnstileApp(expectedAction?: string): Hono {
  return new Hono().post("/register", requireTurnstile(expectedAction), (ctx) =>
    ctx.json({ ok: true }),
  );
}

async function withFetch<TResult>(
  fetchImpl: typeof fetch,
  run: () => Promise<TResult> | TResult,
): Promise<TResult> {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;

  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

describe("rate limit keys", () => {
  unitTest("uses the Cloudflare client address", () => {
    expect(
      clientKey("scope", testRequest("/", { headers: { "cf-connecting-ip": " 1.2.3.4 " } })),
    ).toBe("scope:1.2.3.4");
  });

  unitTest("falls back to x-forwarded-for in development", () => {
    expect(
      clientKey(
        "scope",
        testRequest("/", { headers: { "x-forwarded-for": " 9.9.9.9 , 8.8.8.8" } }),
      ),
    ).toBe("scope:9.9.9.9");
  });

  unitTest("uses a shared bucket when no address is available", () => {
    expect(clientKey("scope", testRequest())).toBe("scope:unknown");
    expect(clientKey("scope", testRequest("/", { headers: { "cf-connecting-ip": "   " } }))).toBe(
      "scope:unknown",
    );
  });

  unitTest("ignores forwarded headers outside development", () => {
    vi.stubEnv("DEV", false);

    try {
      expect(
        clientKey("scope", testRequest("/", { headers: { "x-forwarded-for": "9.9.9.9" } })),
      ).toBe("scope:unknown");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  unitTest("normalizes email keys", () => {
    expect(emailKey("scope", "  User@Example.COM ")).toBe("scope:user@example.com");
    expect(emailKey("scope", "   ")).toBeNull();
  });

  unitTest("scopes record keys by client and truncates long ids", () => {
    expect(clientIdKey("scope", testRequest(), null)).toBe("scope:unknown:unknown");
    expect(clientIdKey("scope", testRequest(), "a".repeat(80))).toBe(
      `scope:${"a".repeat(64)}:unknown`,
    );
  });

  unitTest("reads an email key from a JSON body", async () => {
    const request = testRequest("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: " User@Example.COM " }),
    });

    await expect(bodyEmailKey("scope", request)).resolves.toBe("scope:user@example.com");
    await expect(bodyEmailKey("scope", request.clone())).resolves.toBe("scope:user@example.com");
  });

  unitTest("returns null for invalid or email-less bodies", async () => {
    const invalidJson = testRequest("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const arrayBody = testRequest("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([]),
    });
    const numericEmail = testRequest("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: 42 }),
    });
    const missingEmail = testRequest("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const blankEmail = testRequest("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "  " }),
    });

    await expect(bodyEmailKey("scope", invalidJson)).resolves.toBeNull();
    await expect(bodyEmailKey("scope", arrayBody)).resolves.toBeNull();
    await expect(bodyEmailKey("scope", numericEmail)).resolves.toBeNull();
    await expect(bodyEmailKey("scope", missingEmail)).resolves.toBeNull();
    await expect(bodyEmailKey("scope", blankEmail)).resolves.toBeNull();
  });
});

describe("checkRateLimit", () => {
  const env = testEnv();

  unitTest("allows a request when the key is null or empty", async () => {
    await expect(
      checkRateLimit(testRequest(), env, settings({ key: () => null })),
    ).resolves.toEqual({ allowed: true });
    await expect(checkRateLimit(testRequest(), env, settings({ key: () => "" }))).resolves.toEqual({
      allowed: true,
    });
  });

  unitTest("allows a request when the limiter binding is missing", async () => {
    await expect(
      checkRateLimit(testRequest(), env, settings({ limiter: () => undefined })),
    ).resolves.toEqual({ allowed: true });
  });

  unitTest("denies a request when a missing binding is configured to deny", async () => {
    await expect(
      checkRateLimit(
        testRequest(),
        env,
        settings({
          limiter: () => undefined,
          label: "Test limiter",
          retryAfterSeconds: 12,
          onUnavailable: "deny",
        }),
      ),
    ).resolves.toEqual({ allowed: false, reason: "unavailable", retryAfterSeconds: 12 });
  });

  unitTest("allows and denies based on the limiter outcome", async () => {
    await expect(checkRateLimit(testRequest(), env, settings())).resolves.toEqual({
      allowed: true,
    });
    await expect(
      checkRateLimit(
        testRequest(),
        env,
        settings({
          limiter: () => limiter({ success: false }),
          retryAfterSeconds: 7,
        }),
      ),
    ).resolves.toEqual({ allowed: false, reason: "limited", retryAfterSeconds: 7 });
  });

  unitTest("allows a request when the limiter throws by default", async () => {
    await expect(
      checkRateLimit(
        testRequest(),
        env,
        settings({
          limiter: () => ({ limit: alwaysFails }),
        }),
      ),
    ).resolves.toEqual({ allowed: true });
  });

  unitTest("denies a request when a throwing limiter is configured to deny", async () => {
    await expect(
      checkRateLimit(
        testRequest(),
        env,
        settings({
          limiter: () => ({ limit: alwaysFails }),
          label: "Failing limiter",
          onUnavailable: "deny",
        }),
      ),
    ).resolves.toEqual({ allowed: false, reason: "unavailable", retryAfterSeconds: 60 });
  });
});

describe("rateLimit middleware", () => {
  unitTest("calls the downstream handler when every check allows", async () => {
    const app = new Hono().get("/", rateLimit(settings(), settings({ scope: "second" })), (ctx) =>
      ctx.json({ ok: true }),
    );

    const response = await app.request("/", {}, testEnv());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  unitTest("stops at the first blocked check", async () => {
    let secondChecks = 0;
    const app = new Hono().get(
      "/",
      rateLimit(
        settings({ limiter: () => limiter({ success: false }), retryAfterSeconds: 5 }),
        settings({
          scope: "second",
          key: () => {
            secondChecks += 1;
            return "second:key";
          },
        }),
      ),
      (ctx) => ctx.json({ ok: true }),
    );

    const response = await app.request("/", {}, testEnv());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(secondChecks).toBe(0);
  });

  unitTest("blocks on a later check", async () => {
    const app = new Hono().get(
      "/",
      rateLimit(
        settings(),
        settings({ limiter: () => limiter({ success: false }), scope: "second" }),
      ),
      (ctx) => ctx.json({ ok: true }),
    );

    const response = await app.request("/", {}, testEnv());

    expect(response.status).toBe(429);
  });

  unitTest("passes through with no settings", async () => {
    const app = new Hono().get("/", rateLimit(), (ctx) => ctx.text("ok"));

    const response = await app.request("/", {}, testEnv());

    await expect(response.text()).resolves.toBe("ok");
  });
});

describe("turnstile middleware", () => {
  const turnstileEnv = testEnv({
    TURNSTILE_SECRET: "test-secret",
    TURNSTILE_SITEVERIFY_URL: "https://turnstile.test/siteverify",
  });

  unitTest("rejects a missing or malformed token", async () => {
    const app = turnstileApp();
    const missing = await app.request(
      "http://localhost/register",
      { method: "POST" },
      turnstileEnv,
    );
    const empty = await app.request(
      "http://localhost/register",
      { method: "POST", headers: { "x-turnstile-token": "  " } },
      turnstileEnv,
    );

    expect(missing.status).toBe(403);
    expect(empty.status).toBe(403);
  });

  unitTest("fails when the secret is not configured", async () => {
    const app = turnstileApp();
    const response = await app.request(
      "http://localhost/register",
      { method: "POST", headers: { "x-turnstile-token": "token" } },
      testEnv({ TURNSTILE_SECRET: "" }),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("internal_server_error");
  });

  unitTest("fails when siteverify rejects the request", async () => {
    const app = turnstileApp();
    const response = await withFetch(
      () => Promise.resolve(new Response("nope", { status: 502 })),
      () =>
        app.request(
          "http://localhost/register",
          { method: "POST", headers: { "x-turnstile-token": "token" } },
          turnstileEnv,
        ),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("turnstile_verification_failed");
  });

  unitTest("fails when the siteverify fetch throws", async () => {
    const app = turnstileApp();
    const response = await withFetch(
      () => Promise.reject(new Error("network down")),
      () =>
        app.request(
          "http://localhost/register",
          { method: "POST", headers: { "x-turnstile-token": "token" } },
          turnstileEnv,
        ),
    );

    expect(response.status).toBe(500);
  });

  unitTest("fails when the siteverify response has an invalid shape", async () => {
    const app = turnstileApp();
    const response = await withFetch(
      () => Promise.resolve(Response.json({ success: "yes" })),
      () =>
        app.request(
          "http://localhost/register",
          { method: "POST", headers: { "x-turnstile-token": "token" } },
          turnstileEnv,
        ),
    );

    expect(response.status).toBe(500);
  });

  unitTest("rejects an unsuccessful verification", async () => {
    const app = turnstileApp();
    const response = await withFetch(
      () => Promise.resolve(Response.json({ success: false, "error-codes": ["invalid-input"] })),
      () =>
        app.request(
          "http://localhost/register",
          { method: "POST", headers: { "x-turnstile-token": "token" } },
          turnstileEnv,
        ),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("turnstile_required");
  });

  unitTest("allows Cloudflare test keys in development", async () => {
    const app = turnstileApp("event-registration");
    const response = await withFetch(
      () => Promise.resolve(Response.json({ success: true, action: "other", hostname: "other" })),
      () =>
        app.request(
          "http://localhost/register",
          { method: "POST", headers: { "x-turnstile-token": "token" } },
          turnstileEnv,
        ),
    );

    expect(response.status).toBe(200);
  });

  unitTest("rejects a mismatched action outside development", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");

    try {
      const app = turnstileApp("event-registration");
      const response = await withFetch(
        () =>
          Promise.resolve(Response.json({ success: true, action: "wrong", hostname: "localhost" })),
        () =>
          app.request(
            "http://localhost/register",
            { method: "POST", headers: { "x-turnstile-token": "token" } },
            turnstileEnv,
          ),
      );
      const body = (await response.json()) as { error?: { code?: string } };

      expect(response.status).toBe(403);
      expect(body.error?.code).toBe("turnstile_failed");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  unitTest("rejects a mismatched hostname outside development", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");

    try {
      const app = turnstileApp("event-registration");
      const response = await withFetch(
        () =>
          Promise.resolve(
            Response.json({
              success: true,
              action: "event-registration",
              hostname: "evil.example",
            }),
          ),
        () =>
          app.request(
            "http://localhost/register",
            { method: "POST", headers: { "x-turnstile-token": "token" } },
            turnstileEnv,
          ),
      );
      const body = (await response.json()) as { error?: { code?: string } };

      expect(response.status).toBe(403);
      expect(body.error?.code).toBe("turnstile_failed");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  unitTest("accepts a valid token and forwards the client address", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");

    try {
      const app = turnstileApp("event-registration");
      const response = await withFetch(
        () =>
          Promise.resolve(
            Response.json({ success: true, action: "event-registration", hostname: "localhost" }),
          ),
        () =>
          app.request(
            "http://localhost/register",
            {
              method: "POST",
              headers: {
                "x-turnstile-token": "token",
                "cf-connecting-ip": "203.0.113.8",
              },
            },
            turnstileEnv,
          ),
      );

      expect(response.status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  unitTest("skips the action check when none is expected", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");

    try {
      const app = turnstileApp();
      const response = await withFetch(
        () => Promise.resolve(Response.json({ success: true, hostname: "localhost" })),
        () =>
          app.request(
            "http://localhost/register",
            { method: "POST", headers: { "x-turnstile-token": "token" } },
            turnstileEnv,
          ),
      );

      expect(response.status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("API locale resolution", () => {
  unitTest("prefers a supported query locale", () => {
    expect(resolveAuthLocale(testRequest("/?locale=fr"))).toBe("fr");
  });

  unitTest("falls back to the X-Locale header", () => {
    expect(resolveAuthLocale(testRequest("/", { headers: { "x-locale": "vi" } }))).toBe("vi");
  });

  unitTest("uses Accept-Language with regional fallback", () => {
    expect(
      resolveAuthLocale(testRequest("/", { headers: { "accept-language": "fr-CA,en;q=0.8" } })),
    ).toBe("fr");
  });

  unitTest("skips unsupported locales and defaults", () => {
    expect(
      resolveAuthLocale(
        testRequest("/?locale=de", {
          headers: { "x-locale": "de", "accept-language": "de,es;q=0.5" },
        }),
      ),
    ).toBe(DEFAULT_LOCALE);
  });

  unitTest("localizes known, unknown, and unsupported locale codes", () => {
    expect(authMessage("not_found", "fr")).toBe("Introuvable.");
    expect(authMessage("unknown_code", "fr")).toBe("Une erreur est survenue.");
    expect(authMessage("not_found", "de")).toBe("Not found.");
  });

  unitTest("falls back through every message catalog level", async () => {
    const cases = [
      [{}, { not_found: "Fallback code" }, "not_found", "Fallback code"],
      [{ generic_error: "French generic" }, {}, "missing", "French generic"],
      [{}, { generic_error: "English generic" }, "missing", "English generic"],
      [{}, {}, "missing", ""],
    ] as const;

    for (const [fr, en, code, expected] of cases) {
      vi.resetModules();
      vi.doMock("~/generated/server/sharedApiMessages", () => ({
        localized: (locale: string) => ({
          // oxlint-disable-next-line no-nested-ternary -- catalog fallback fixture.
          sharedApiMessages: locale === "fr" ? fr : locale === "en" ? en : {},
        }),
      }));
      vi.doMock("~/generated/server/engineApiMessages", () => ({
        localized: () => ({ engineApiMessages: {} }),
      }));

      try {
        const module =
          // oxlint-disable-next-line eslint/no-await-in-loop -- each case loads a freshly mocked module.
          await import("../../../src/server/routes/auth");

        expect(module.authMessage(code, "fr")).toBe(expected);
      } finally {
        vi.doUnmock("~/generated/server/sharedApiMessages");
        vi.doUnmock("~/generated/server/engineApiMessages");
      }
    }

    vi.resetModules();
  });
});

describe("body limit middleware", () => {
  test("rejects oversized API payloads", async ({ api }) => {
    const response = await api.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "x".repeat(1024 * 1024) }),
    });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(413);
    expect(body.error?.code).toBe("payload_too_large");
  });
});
