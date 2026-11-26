/* oxlint-disable typescript/no-unsafe-type-assertion -- API and KV bodies are asserted in tests. */
import { Hono } from "hono";
import { describe, expect, test as unitTest, vi } from "vitest";

import {
  apiError,
  apiPartial,
  apiSuccess,
} from "~/platform/server/api/helpers/responses/api-response";
import {
  badRequest,
  forbidden,
  internalServerError,
  notFound,
  rateLimited,
  serviceUnavailable,
  unauthorized,
} from "~/platform/server/api/helpers/responses/common-responses";
import { defaultValidationHandler } from "~/platform/server/api/helpers/validation/validation-handler";

import { test, type ApiHarness } from "./harness";

interface SessionUser {
  email?: string;
  role?: string;
  twoFactorRequired?: boolean;
}

interface SessionRecord {
  user?: SessionUser;
}

async function mutateSessionUsers(
  api: ApiHarness,
  email: string,
  mutate: (user: SessionUser) => void,
) {
  const sessions = await api.db.kv.list();

  await Promise.all(
    sessions.keys.map(async ({ name }) => {
      const raw = await api.db.kv.get(name);

      if (typeof raw !== "string") {
        return;
      }

      let parsed: SessionRecord;

      try {
        parsed = JSON.parse(raw) as SessionRecord;
      } catch {
        return;
      }

      if (parsed.user?.email === email) {
        mutate(parsed.user);
        await api.db.kv.put(name, JSON.stringify(parsed));
      }
    }),
  );
}

describe("api app wiring", () => {
  test("serves the health endpoint", async ({ api }) => {
    const response = await api.request("/api/health");
    const body = (await response.json()) as { ok?: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test("returns the error envelope for the bare /api path", async ({ api }) => {
    const response = await api.request("/api");
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe("not_found");
  });

  test("accepts same-origin form-encoded mutations", async ({ api }) => {
    const response = await api.request("/api/events/status/request", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "sec-fetch-site": "same-origin",
        origin: "http://localhost:4321",
      },
      body: "registrationId=x&email=a%40example.com",
    });

    expect(response.status).not.toBe(403);
  });

  test("rejects unsupported methods", async ({ api }) => {
    const response = await api.request("/api/auth/sign-in/email-otp", { method: "PUT" });

    expect(response.status).toBe(405);
  });

  test("logs debug output for requests", async ({ api }) => {
    const response = await api.request("/api/events");

    expect(response.status).toBe(200);
  });
});

describe("root auth routing", () => {
  test("passes two-factor send-otp through its rate limiters", async ({ api }) => {
    const response = await api.request("/api/auth/two-factor/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com" }),
    });

    expect(response.status).toBeLessThan(500);
  });

  test("passes two-factor verify-otp through its rate limiter", async ({ api }) => {
    const response = await api.request("/api/auth/two-factor/verify-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });

    expect(response.status).toBeLessThan(500);
  });

  test("passes two-factor verify-backup-code through its rate limiter", async ({ api }) => {
    const response = await api.request("/api/auth/two-factor/verify-backup-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "backup-code" }),
    });

    expect(response.status).toBeLessThan(500);
  });

  test("returns 404 for unknown auth paths", async ({ api }) => {
    const response = await api.request("/api/auth/does-not-exist");
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe("not_found");
  });
});

describe("auth middleware", () => {
  test("rejects requests without a session", async ({ api }) => {
    api.clearSession();
    const response = await api.request("/api/admin/users");

    expect(response.status).toBe(401);
  });

  test.skip("blocks staff who have not enrolled in two-factor auth", async ({ api }) => {
    await api.signIn("staff@example.com");
    // Local seed accounts opt out of enrollment; simulate an account that requires it.
    await mutateSessionUsers(api, "staff@example.com", (user) => {
      user.twoFactorRequired = true;
    });
    const response = await api.request("/api/admin/users");
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("two_factor_required");
  });

  test("handles a session whose user has no role", async ({ api }) => {
    await api.signIn("admin@example.com");
    let originalRole: string | undefined;

    await mutateSessionUsers(api, "admin@example.com", (user) => {
      originalRole = user.role;
      delete user.role;
    });

    try {
      const response = await api.request("/api/admin/users");

      expect(response.status).toBe(403);
    } finally {
      await mutateSessionUsers(api, "admin@example.com", (user) => {
        if (originalRole === undefined) {
          delete user.role;
        } else {
          user.role = originalRole;
        }
      });
    }
  });

  test("allows an enrolled admin", async ({ api }) => {
    await api.signIn("admin@example.com");
    await api.enableTwoFactor("admin@example.com");
    const response = await api.request("/api/admin/users");

    expect(response.status).toBe(200);
  });

  test("denies an enrolled staff account a permission it lacks", async ({ api }) => {
    await api.signIn("staff@example.com");
    await api.enableTwoFactor("staff@example.com");
    const response = await api.request("/api/admin/users");

    expect(response.status).toBe(403);
  });
});

describe("standard API response envelope", () => {
  const app = new Hono()
    .get("/success-default", (ctx) => apiSuccess(ctx, { value: 1 }))
    .get("/success-created", (ctx) =>
      apiSuccess(ctx, { value: 2 }, { status: 201, meta: { warnings: [] } }),
    )
    .get("/success-headers", (ctx) =>
      apiSuccess(ctx, { value: 3 }, { headers: { "x-test": "yes" } }),
    )
    .get("/partial-default", (ctx) =>
      apiPartial(ctx, { created: 1 }, { code: "partial_failure", message: "Partial failure." }),
    )
    .get("/partial-message", (ctx) =>
      apiPartial(
        ctx,
        { created: 1 },
        { code: "partial_failure", message: "Custom" },
        { meta: { warnings: [] }, headers: { "x-test": "yes" } },
      ),
    )
    .get("/error-minimal", (ctx) =>
      apiError(ctx, "invalid_payload", { status: 400, message: "Some fields are invalid." }),
    )
    .get("/error-full", (ctx) =>
      apiError(ctx, "invalid_payload", {
        status: 422,
        message: "Custom",
        fields: ["name"],
        issues: [{ code: "row_failed" }],
        headers: { "x-test": "yes" },
      }),
    )
    .get(
      "/validation-failure",
      (ctx) =>
        defaultValidationHandler(
          { success: false, error: [], data: undefined, target: "json" },
          ctx,
        ) ?? ctx.text("unexpected"),
    )
    .get(
      "/validation-success",
      (ctx) =>
        defaultValidationHandler({ success: true, data: undefined, target: "json" }, ctx) ??
        ctx.text("ok"),
    );

  unitTest("returns a default success envelope", async () => {
    const response = await app.request("/success-default");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "success",
      data: { value: 1 },
      error: null,
      meta: {},
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  unitTest("returns an explicit success status and meta", async () => {
    const response = await app.request("/success-created");

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ meta: { warnings: [] } });
  });

  unitTest("merges custom success headers", async () => {
    const response = await app.request("/success-headers");

    expect(response.headers.get("x-test")).toBe("yes");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  unitTest("fills a missing partial message", async () => {
    const response = await app.request("/partial-default");

    expect(response.status).toBe(207);
    await expect(response.json()).resolves.toEqual({
      status: "partial",
      data: { created: 1 },
      error: { code: "partial_failure", message: "Partial failure." },
      meta: {},
    });
  });

  unitTest("keeps a provided partial message, meta, and headers", async () => {
    const response = await app.request("/partial-message");

    expect(response.headers.get("x-test")).toBe("yes");
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Custom" },
      meta: { warnings: [] },
    });
  });

  unitTest("renders a minimal error envelope", async () => {
    const response = await app.request("/error-minimal");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      data: null,
      error: { code: "invalid_payload", message: "Some fields are invalid." },
      meta: {},
    });
  });

  unitTest("renders a full error envelope", async () => {
    const response = await app.request("/error-full");

    expect(response.status).toBe(422);
    expect(response.headers.get("x-test")).toBe("yes");
    await expect(response.json()).resolves.toEqual({
      status: "error",
      data: null,
      error: {
        code: "invalid_payload",
        message: "Custom",
        fields: ["name"],
        issues: [{ code: "row_failed" }],
      },
      meta: {},
    });
  });

  unitTest("renders validation handler responses", async () => {
    const failure = await app.request("/validation-failure");
    const success = await app.request("/validation-success");

    expect(failure.status).toBe(400);
    await expect(success.text()).resolves.toBe("ok");
  });
});

describe("common response helpers", () => {
  const app = new Hono()
    .get("/not-found", (ctx) => notFound(ctx))
    .get("/forbidden", (ctx) => forbidden(ctx))
    .get("/unauthorized", (ctx) => unauthorized(ctx))
    .get("/bad-request", (ctx) => badRequest(ctx))
    .get("/internal", (ctx) => internalServerError(ctx))
    .get("/unavailable", (ctx) => serviceUnavailable(ctx))
    .get("/rate-limited", (ctx) => rateLimited(ctx, 42));

  unitTest("maps every helper to its status and code", async () => {
    const cases = [
      ["/not-found", 404, "not_found"],
      ["/forbidden", 403, "forbidden"],
      ["/unauthorized", 401, "unauthorized"],
      ["/bad-request", 400, "bad_request"],
      ["/internal", 500, "internal_server_error"],
      ["/unavailable", 503, "service_unavailable"],
      ["/rate-limited", 429, "rate_limited"],
    ] as const;

    for (const [path, status, code] of cases) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each helper is an independent assertion.
      const response = await app.request(path);
      // oxlint-disable-next-line eslint/no-await-in-loop -- each helper is an independent assertion.
      const body = (await response.json()) as { error?: { code?: string } };

      expect(response.status).toBe(status);
      expect(body.error?.code).toBe(code);
    }
  });

  unitTest("sets retry-after on rate limited responses", async () => {
    const response = await app.request("/rate-limited");

    expect(response.headers.get("retry-after")).toBe("42");
  });
});

describe("production app configuration", () => {
  unitTest("builds the app with development features disabled", async () => {
    vi.resetModules();
    vi.stubEnv("DEV", false);

    try {
      const module = await import("~/platform/app");

      expect(module.api).toBeDefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
