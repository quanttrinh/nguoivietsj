/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies and the minimal Workers context are asserted in tests. */
import type { ExecutionContext } from "@cloudflare/workers-types";
import { describe, expect } from "vitest";

import { api as apiApp } from "../../../../src/server/app";
import { test, type ApiHarness } from "../harness";

const BASE_URL = "http://localhost:4321";
const EVIL_ORIGIN = "https://evil.example";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
const JSON_CONTENT_TYPE = "application/json";
const FORM_BODY = "email=a%40example.com";

/** `import.meta.env.DEV` decides both frame-ancestors and X-Frame-Options in the app. */
const isDev = import.meta.env.DEV;

/**
 * Call the app directly so the test controls every security-relevant header.
 * The harness fixture supplies the env (and installs the global fetch stub),
 * but its `request` helper injects default `origin`/`sec-fetch-site` values.
 */
async function requestWithExactHeaders(
  api: ApiHarness,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const context = {
    waitUntil: (_promise: Promise<unknown>) => {
      // Fire-and-forget work is not observed by these tests.
    },
    passThroughOnException: () => {
      // No-op.
    },
  } as ExecutionContext;

  const response = await apiApp.request(`${BASE_URL}${path}`, init, api.env, context);

  return response;
}

function expectSecureHeaders(response: Response) {
  const headers = response.headers;
  const csp = headers.get("content-security-policy") ?? "";

  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("script-src 'none'");
  expect(csp).toContain("object-src 'none'");
  // The app widens frame-ancestors to '*' in development and pins it to
  // 'none' in production, so assert whichever directive the running app uses.
  expect(csp).toContain(isDev ? "frame-ancestors *" : "frame-ancestors 'none'");

  expect(headers.get("x-content-type-options")).toBe("nosniff");
  expect(headers.get("referrer-policy")).toBe("no-referrer");

  const permissions = headers.get("permissions-policy") ?? "";
  expect(permissions).toContain("camera=(self)");
  expect(permissions).toContain("microphone=()");
  expect(permissions).toContain("geolocation=()");

  // X-Frame-Options is disabled entirely in development ("false" in the
  // secureHeaders config) and set to DENY in production.
  if (isDev) {
    expect(headers.get("x-frame-options")).toBeNull();
  } else {
    expect(headers.get("x-frame-options")).toBe("DENY");
  }
}

const UNSAFE_METHODS = ["POST", "PATCH", "DELETE", "PUT"] as const;
const SEC_FETCH_SITES = ["cross-site", "same-site", "none"] as const;
const ORIGIN_CASES = [
  { label: "no", origin: undefined },
  { label: "evil", origin: EVIL_ORIGIN },
  { label: "same-site", origin: BASE_URL },
] as const;

interface CsrfCase {
  label: string;
  method: (typeof UNSAFE_METHODS)[number];
  secFetchSite: (typeof SEC_FETCH_SITES)[number];
  origin: string | undefined;
  originLabel: string;
  blocked: boolean;
}

/**
 * This app trusts `same-origin`/`none` fetch sites and a same-origin `origin`.
 * A `cross-site` fetch is always rejected, even when it carries a trusted
 * Origin; `same-site` is rejected unless the origin is trusted.
 */
const csrfCases: CsrfCase[] = UNSAFE_METHODS.flatMap((method) =>
  SEC_FETCH_SITES.flatMap((secFetchSite) =>
    ORIGIN_CASES.map(({ label: originLabel, origin }) => ({
      label: `${method} / sec-fetch-site=${secFetchSite} / ${originLabel} origin`,
      method,
      secFetchSite,
      origin,
      originLabel,
      blocked:
        secFetchSite === "cross-site" || (secFetchSite === "same-site" && origin !== BASE_URL),
    })),
  ),
);

describe("transport security headers", () => {
  test.for([
    { label: "a successful health check", path: "/api/health", init: {} },
    {
      label: "a sign-in validation error",
      path: "/api/auth/sign-in/email-otp",
      init: {
        method: "POST",
        headers: { "content-type": JSON_CONTENT_TYPE },
        body: "junk",
      },
    },
    { label: "a not-found response", path: "/api/nope", init: {} },
  ])("applies the full secure header set to $label", async (responseCase, { api }) => {
    const response = await api.request(responseCase.path, responseCase.init);

    expect(response.status).toBeLessThan(500);
    expectSecureHeaders(response);
  });
});

describe("CSRF controls", () => {
  test.for(csrfCases)("unsafe mutation: $label (blocked: $blocked)", async (csrfCase, { api }) => {
    const headers: Record<string, string> = {
      "content-type": FORM_CONTENT_TYPE,
      "sec-fetch-site": csrfCase.secFetchSite,
    };

    if (csrfCase.origin !== undefined) {
      headers.origin = csrfCase.origin;
    }

    const response = await requestWithExactHeaders(api, "/api/events/status/request", {
      method: csrfCase.method,
      headers,
      body: FORM_BODY,
    });

    if (csrfCase.blocked) {
      expect(response.status).toBe(403);
      await expect(response.text()).resolves.toBe("Forbidden");
    } else {
      // Not blocked by CSRF: reaches the app's normal validation/routing.
      expect(response.status).not.toBe(403);
      expect(response.status).toBeLessThan(500);
    }
  });

  test.for(["GET", "HEAD"] as const)(
    "safe %s requests are never CSRF-blocked, even cross-site",
    async (method, { api }) => {
      const response = await requestWithExactHeaders(api, "/api/events", {
        method,
        headers: { "sec-fetch-site": "cross-site", origin: EVIL_ORIGIN },
      });

      expect(response.status).not.toBe(403);
      expect(response.status).toBe(200);
    },
  );

  test("cross-site JSON mutations reach validation instead of being CSRF-blocked", async ({
    api,
  }) => {
    // Hono's CSRF check only covers "simple" content types; application/json
    // triggers a CORS preflight in browsers, so it is intentionally not blocked.
    const response = await requestWithExactHeaders(api, "/api/events/status/request", {
      method: "POST",
      headers: {
        "content-type": JSON_CONTENT_TYPE,
        "sec-fetch-site": "cross-site",
        origin: EVIL_ORIGIN,
      },
      body: "{}",
    });

    expect(response.status).not.toBe(403);
    expect(response.status).toBeLessThan(500);
  });

  test("a trusted-looking Referer cannot make a cross-site mutation pass CSRF", async ({ api }) => {
    const response = await requestWithExactHeaders(api, "/api/events/status/request", {
      method: "POST",
      headers: {
        "content-type": FORM_CONTENT_TYPE,
        "sec-fetch-site": "cross-site",
        referer: `${BASE_URL}/trusted-page`,
      },
      body: FORM_BODY,
    });

    expect(response.status).toBe(403);
  });

  test("a trusted-looking Origin cannot override cross-site sec-fetch-site", async ({ api }) => {
    const response = await requestWithExactHeaders(api, "/api/events/status/request", {
      method: "POST",
      headers: {
        "content-type": FORM_CONTENT_TYPE,
        "sec-fetch-site": "cross-site",
        origin: BASE_URL,
        referer: `${BASE_URL}/trusted-page`,
      },
      body: FORM_BODY,
    });

    expect(response.status).toBe(403);
  });
});

describe("request body and method handling", () => {
  test("oversized bodies return a JSON envelope that still carries secure headers", async ({
    api,
  }) => {
    const response = await api.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "content-type": JSON_CONTENT_TYPE },
      body: JSON.stringify({ email: "a@example.com", password: "x".repeat(1024 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
      error: { code: "payload_too_large" },
    });
    expectSecureHeaders(response);
  });

  test("malformed JSON returns a 4xx JSON error body", async ({ api }) => {
    const response = await api.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "content-type": JSON_CONTENT_TYPE },
      body: "{not-json",
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toHaveProperty("code");
  });

  test.for(["PUT", "PATCH", "DELETE"] as const)(
    "unsupported %s on a known path returns a safe 405",
    async (method, { api }) => {
      const response = await api.request("/api/events", { method });

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toContain("GET");
      expectSecureHeaders(response);

      const body = await response.text();
      expect(body).not.toMatch(/stack trace|at \/|Error:/iu);
    },
  );
});
