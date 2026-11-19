/* oxlint-disable eslint/max-lines -- middleware coverage needs one focused app per failure mode. */
/* oxlint-disable typescript/no-unsafe-type-assertion -- test responses and env objects are asserted. */
import { Hono } from "hono";
import { describe, expect, test as unitTest, vi } from "vitest";

import { localizeApiErrors } from "../../../src/server/middleware/localize-api-errors";
import {
  apiMessage,
  resolveRequestLocale,
} from "../../../src/server/middleware/localize-api-errors/api-messages";
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
import { DEFAULT_LOCALE } from "../../../src/shared/constants/locales";
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

describe("localized API errors", () => {
  const app = new Hono()
    .use(localizeApiErrors())
    .get("/envelope", (ctx) =>
      ctx.json({ status: "error", data: null, error: { code: "not_found" }, meta: {} }, 404),
    )
    .get("/envelope-empty-message", (ctx) =>
      ctx.json(
        { status: "error", data: null, error: { code: "not_found", message: "" }, meta: {} },
        404,
      ),
    )
    .get("/envelope-custom", (ctx) =>
      ctx.json(
        { status: "error", data: null, error: { code: "not_found", message: "Custom" }, meta: {} },
        404,
      ),
    )
    .get("/envelope-no-code", (ctx) =>
      ctx.json({ status: "error", data: null, error: { message: "Custom" }, meta: {} }, 400),
    )
    .get("/envelope-bad-error", (ctx) =>
      ctx.json({ status: "error", data: null, error: "nope", meta: {} }, 500),
    )
    .get("/partial", (ctx) =>
      ctx.json({ status: "partial", data: {}, error: { code: "rate_limited" }, meta: {} }, 207),
    )
    .get("/warnings", (ctx) =>
      ctx.json({
        status: "success",
        data: {},
        error: null,
        meta: {
          warnings: [
            { code: "not_found" },
            { code: "unauthorized", message: "Custom" },
            "plain",
            { message: "No code" },
          ],
        },
      }),
    )
    .get("/warnings-custom", (ctx) =>
      ctx.json({
        status: "success",
        data: {},
        error: null,
        meta: { warnings: [{ code: "not_found", message: "Custom" }] },
      }),
    )
    .get("/warnings-not-array", (ctx) =>
      ctx.json({ status: "success", data: {}, error: null, meta: { warnings: "no" } }),
    )
    .get("/legacy-code", (ctx) => ctx.json({ code: "INVALID_EMAIL_OR_PASSWORD" }, 401))
    .get("/legacy-error", (ctx) => ctx.json({ error: "not_found" }, 404))
    .get("/legacy-error-message", (ctx) => ctx.json({ error: "not_found", message: "Custom" }, 404))
    .get("/legacy-both", (ctx) => ctx.json({ code: "not_found", message: "Custom" }, 400))
    .get("/legacy-invalid", (ctx) => ctx.json({ code: 42 }, 400))
    .get("/legacy-message-429", (ctx) => ctx.json({ message: "Too many" }, 429))
    .get("/legacy-empty-400", (ctx) => ctx.json({}, 400))
    .get("/legacy-207", (ctx) => ctx.json({ code: "not_found" }, 207))
    .get("/legacy-ok", (ctx) => ctx.json({ code: "not_found" }))
    .get("/non-record", (ctx) => ctx.json([1, 2]))
    .get("/non-json", () => new Response("plain", { headers: { "content-type": "text/plain" } }))
    .get("/missing-content-type", () => new Response("plain"))
    .get(
      "/invalid-json",
      () => new Response("{", { headers: { "content-type": "application/json" } }),
    )
    .get("/vary-existing", (ctx) => {
      ctx.header("vary", "Origin");

      return ctx.json({ status: "error", data: null, error: { code: "not_found" }, meta: {} }, 404);
    });

  unitTest("localizes an error envelope without a message", async () => {
    const response = await app.request("/envelope?locale=fr");

    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found", message: "Introuvable." },
    });
    expect(response.headers.get("vary")).toContain("Accept-Language");
  });

  unitTest("localizes an empty error message", async () => {
    const response = await app.request("/envelope-empty-message?locale=fr");

    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Introuvable." },
    });
  });

  unitTest("keeps an authored error message", async () => {
    const response = await app.request("/envelope-custom?locale=fr");

    await expect(response.json()).resolves.toMatchObject({ error: { message: "Custom" } });
  });

  unitTest("skips envelopes without a usable error code", async () => {
    const noCode = await app.request("/envelope-no-code");
    const badError = await app.request("/envelope-bad-error");

    await expect(noCode.json()).resolves.toMatchObject({ error: { message: "Custom" } });
    await expect(badError.json()).resolves.toMatchObject({ error: "nope" });
  });

  unitTest("localizes a partial error envelope", async () => {
    const response = await app.request("/partial?locale=fr");

    await expect(response.json()).resolves.toMatchObject({
      status: "partial",
      error: { message: "Trop de requêtes. Réessayez plus tard." },
    });
  });

  unitTest("localizes warning codes and keeps other warnings", async () => {
    const response = await app.request("/warnings?locale=fr");
    const body = (await response.json()) as {
      meta?: { warnings?: ({ code?: string; message?: string } | string)[] };
    };

    expect(body.meta?.warnings?.[0]).toEqual({ code: "not_found", message: "Introuvable." });
    expect(body.meta?.warnings?.[1]).toEqual({
      code: "unauthorized",
      message: "Custom",
    });
    expect(body.meta?.warnings?.[2]).toBe("plain");
    expect(body.meta?.warnings?.[3]).toEqual({ message: "No code" });
  });

  unitTest("leaves warnings untouched when they already have messages", async () => {
    const response = await app.request("/warnings-custom?locale=fr");

    await expect(response.json()).resolves.toMatchObject({
      meta: { warnings: [{ code: "not_found", message: "Custom" }] },
    });
  });

  unitTest("ignores a non-array warnings value", async () => {
    const response = await app.request("/warnings-not-array?locale=fr");

    await expect(response.json()).resolves.toMatchObject({ meta: { warnings: "no" } });
  });

  unitTest("localizes a legacy code body", async () => {
    const response = await app.request("/legacy-code?locale=fr");

    await expect(response.json()).resolves.toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Courriel ou mot de passe incorrect.",
    });
  });

  unitTest("localizes a legacy error field and a bare 429", async () => {
    const errorField = await app.request("/legacy-error?locale=fr");
    const rateLimited = await app.request("/legacy-message-429?locale=fr");

    await expect(errorField.json()).resolves.toEqual({
      error: "not_found",
      message: "Introuvable.",
    });
    await expect(rateLimited.json()).resolves.toEqual({
      message: "Trop de requêtes. Réessayez plus tard.",
    });
  });

  unitTest("leaves a legacy error with its own message untouched", async () => {
    const response = await app.request("/legacy-error-message?locale=fr");

    await expect(response.json()).resolves.toEqual({ error: "not_found", message: "Custom" });
  });

  unitTest("localizes legacy code bodies even with a message", async () => {
    const both = await app.request("/legacy-both?locale=fr");
    const empty = await app.request("/legacy-empty-400?locale=fr");

    await expect(both.json()).resolves.toEqual({ code: "not_found", message: "Introuvable." });
    await expect(empty.json()).resolves.toEqual({});
  });

  unitTest("ignores invalid legacy bodies, 207 responses, and success responses", async () => {
    const invalid = await app.request("/legacy-invalid?locale=fr");
    const partial = await app.request("/legacy-207?locale=fr");
    const success = await app.request("/legacy-ok?locale=fr");

    await expect(invalid.json()).resolves.toEqual({ code: 42 });
    await expect(partial.json()).resolves.toEqual({ code: "not_found" });
    await expect(success.json()).resolves.toEqual({ code: "not_found" });
  });

  unitTest("ignores bodies without a JSON content type or with invalid JSON", async () => {
    const nonJson = await app.request("/non-json");
    const missingType = await app.request("/missing-content-type");
    const invalidJson = await app.request("/invalid-json");
    const nonRecord = await app.request("/non-record");

    await expect(nonJson.text()).resolves.toBe("plain");
    await expect(missingType.text()).resolves.toBe("plain");
    await expect(invalidJson.text()).resolves.toBe("{");
    await expect(nonRecord.json()).resolves.toEqual([1, 2]);
  });

  unitTest("appends to an existing vary header", async () => {
    const response = await app.request("/vary-existing?locale=fr");

    expect(response.headers.get("vary")).toBe("Origin, Accept-Language, X-Locale");
  });
});

describe("API locale resolution", () => {
  unitTest("prefers a supported query locale", () => {
    expect(resolveRequestLocale(testRequest("/?locale=fr"))).toBe("fr");
  });

  unitTest("falls back to the X-Locale header", () => {
    expect(resolveRequestLocale(testRequest("/", { headers: { "x-locale": "vi" } }))).toBe("vi");
  });

  unitTest("uses Accept-Language with regional fallback", () => {
    expect(
      resolveRequestLocale(testRequest("/", { headers: { "accept-language": "fr-CA,en;q=0.8" } })),
    ).toBe("fr");
  });

  unitTest("skips unsupported locales and defaults", () => {
    expect(
      resolveRequestLocale(
        testRequest("/?locale=de", {
          headers: { "x-locale": "de", "accept-language": "de,es;q=0.5" },
        }),
      ),
    ).toBe(DEFAULT_LOCALE);
  });

  unitTest("localizes known, unknown, and unsupported locale codes", () => {
    expect(apiMessage("not_found", "fr")).toBe("Introuvable.");
    expect(apiMessage("unknown_code", "fr")).toBe("Une erreur est survenue.");
    expect(apiMessage("not_found", "de")).toBe("Not found.");
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
      vi.doMock("intlayer", async () => {
        const actual = await vi.importActual<typeof import("intlayer")>("intlayer");

        return {
          ...actual,
          getDictionary: (_content: unknown, locale: string) => (locale === "en" ? en : fr),
        };
      });

      try {
        const module =
          // oxlint-disable-next-line eslint/no-await-in-loop -- each case loads a freshly mocked module.
          await import("../../../src/server/middleware/localize-api-errors/api-messages");

        expect(module.apiMessage(code, "fr")).toBe(expected);
      } finally {
        vi.doUnmock("intlayer");
      }
    }

    vi.resetModules();
  });
});

describe("body limit middleware", () => {
  test("rejects oversized API payloads", async ({ api }) => {
    const response = await api.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "x".repeat(1024 * 1024) }),
    });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(413);
    expect(body.error?.code).toBe("payload_too_large");
  });
});
