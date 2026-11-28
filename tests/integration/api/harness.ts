import type { ExecutionContext } from "@cloudflare/workers-types";
import { test as baseTest, vi } from "vitest";

import { api } from "~/platform/app";

import { startDatabase, type TestDatabase } from "../helpers/d1";

const BASE_URL = "http://localhost:4321";
const AUTH_SECRET = "test-secret-test-secret-test-secret";

interface LimiterController {
  allow: boolean;
  binding: () => { limit: (input: { key: string }) => Promise<{ success: boolean }> };
}

function createLimiter(): LimiterController {
  const controller: LimiterController = {
    allow: true,
    binding: () => ({
      limit: () => Promise.resolve({ success: controller.allow }),
    }),
  };

  return controller;
}

export interface ApiHarness {
  db: TestDatabase;
  env: Record<string, unknown>;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  signIn: (email: string, password?: string) => Promise<Response>;
  clearSession: () => void;
  close: () => Promise<void>;
  queue: { send: ReturnType<typeof vi.fn> };
  limiters: Record<
    "registration" | "status" | "signIn" | "sendOtp" | "verifyOtp",
    LimiterController
  >;
}

function fetchUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

export async function createApiHarness(): Promise<ApiHarness> {
  const db = await startDatabase();
  const limiters = {
    registration: createLimiter(),
    status: createLimiter(),
    signIn: createLimiter(),
    sendOtp: createLimiter(),
    verifyOtp: createLimiter(),
  };
  const queue = { send: vi.fn(() => Promise.resolve({})) };
  const env = {
    APP_DB: db.app,
    EVENT_ENGINE_DB: db.events,
    AUTH_SESSION_KV: db.kv,
    EMAIL_QUEUE: queue,
    BETTER_AUTH_SECRET: AUTH_SECRET,
    AUTH_PASSWORD_CONFIG:
      '{"iterations":1000,"saltBytes":8,"keyBits":128,"prefix":"pbkdf2_test","pepper":"cGVwcGVyLXZhbHVlLTEyMzQ"}',
    TURNSTILE_SECRET: "test-turnstile-secret",
    TURNSTILE_SITEVERIFY_URL: "https://turnstile.test/siteverify",
    TURNSTILE_SCRIPT_URL: "https://challenges.cloudflare.com/turnstile/v0/api.js",
    MAILTRAP_API_URL: "",
    MAILTRAP_TEMPLATE_REGISTRATION_RECEIVED: "test-registration-template",
    MAILTRAP_TEMPLATE_PAYMENT_CONFIRMED: "test-payment-template",
    MAILTRAP_TEMPLATE_STATUS_OTP: "test-status-otp-template",
    MAILTRAP_TEMPLATE_TWO_FACTOR_CODE: "test-two-factor-template",
    EVENT_ENGINE_REGISTRATION_RATE_LIMITER: limiters.registration.binding(),
    EVENT_ENGINE_STATUS_RATE_LIMITER: limiters.status.binding(),
    AUTH_SIGN_IN_RATE_LIMITER: limiters.signIn.binding(),
    AUTH_SEND_OTP_RATE_LIMITER: limiters.sendOtp.binding(),
    AUTH_VERIFY_OTP_RATE_LIMITER: limiters.verifyOtp.binding(),
  };

  let cookie = "";
  const originalFetch = globalThis.fetch;

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (fetchUrl(input).startsWith("https://turnstile.test/")) {
      return Response.json({
        success: true,
        action: "event-registration",
        hostname: "localhost",
      });
    }

    return originalFetch(input, init);
  });

  // Minimal ExecutionContext for direct app.request calls.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tests do not run inside workerd.
  const context = {
    waitUntil: (_promise: Promise<unknown>) => {
      // Status OTP delivery is fire-and-forget in tests.
    },
    passThroughOnException: () => {
      // No-op.
    },
  } as ExecutionContext;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);

    if (!headers.has("sec-fetch-site")) {
      headers.set("sec-fetch-site", "same-origin");
    }

    if (!headers.has("origin")) {
      headers.set("origin", BASE_URL);
    }

    if (cookie.length > 0) {
      headers.set("cookie", cookie);
    }

    const response = await api.request(`${BASE_URL}${path}`, { ...init, headers }, env, context);

    return response;
  }

  async function signIn(email: string, _password?: string): Promise<Response> {
    await request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, type: "sign-in" }),
    });

    const response = await request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, otp: "123456" }),
    });

    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");

    return response;
  }

  return {
    db,
    env,
    request,
    signIn,
    clearSession: () => {
      cookie = "";
    },
    queue,
    limiters,
    close: async () => {
      vi.unstubAllGlobals();
      await db.dispose();
    },
  };
}

/** File-scoped API fixture: one seeded database per test file. */
export const test = baseTest.extend(
  "api",
  { scope: "file" },
  // oxlint-disable-next-line eslint/no-empty-pattern -- builder fixtures require the context argument.
  async ({}, { onCleanup }): Promise<ApiHarness> => {
    const harness = await createApiHarness();

    onCleanup(async () => {
      await harness.close();
    });

    return harness;
  },
);
