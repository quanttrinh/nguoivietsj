import type { ExecutionContext } from "@cloudflare/workers-types";
import { test as baseTest, vi } from "vitest";

import { api } from "../../../src/server/app";
import { isRecord } from "../../../src/shared/utils/records";
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
  enableTwoFactor: (email: string) => Promise<void>;
  close: () => Promise<void>;
  queue: { send: ReturnType<typeof vi.fn> };
  limiters: Record<
    "registration" | "status" | "signIn" | "sendOtp" | "verifyOtp",
    LimiterController
  >;
}

async function refreshSessionUser(
  kv: TestDatabase["kv"],
  key: string,
  email: string,
): Promise<void> {
  const raw = await kv.get(key);

  if (typeof raw !== "string") {
    return;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (!isRecord(parsed) || !isRecord(parsed.user) || parsed.user.email !== email) {
    return;
  }

  parsed.user.twoFactorEnabled = true;
  await kv.put(key, JSON.stringify(parsed));
}

function fetchUrl(input: RequestInfo | URL): string {
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
    TURNSTILE_SECRET: "test-turnstile-secret",
    TURNSTILE_SITEVERIFY_URL: "https://turnstile.test/siteverify",
    TURNSTILE_SCRIPT_URL: "https://challenges.cloudflare.com/turnstile/v0/api.js",
    EMAIL_PROVIDER: "mailtrap",
    GMAIL_SENDER_EMAIL: "events@example.com",
    GMAIL_SENDER_NAME: "Test events",
    GMAIL_TOKEN_URL: "https://oauth2.googleapis.com/token",
    GMAIL_SEND_URL: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    MAILTRAP_API_URL: "",
    MAILTRAP_FROM_EMAIL: "",
    MAILTRAP_FROM_NAME: "",
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

  async function signIn(email: string, password = "dev-password"): Promise<Response> {
    const response = await request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");

    return response;
  }

  async function enableTwoFactor(email: string): Promise<void> {
    await db.app
      .prepare("UPDATE user SET two_factor_enabled = 1 WHERE email = ?")
      .bind(email)
      .run();

    // Better Auth caches the user inside each session record; refresh it.
    const sessions = await db.kv.list();

    await Promise.all(sessions.keys.map((key) => refreshSessionUser(db.kv, key.name, email)));
  }

  return {
    db,
    env,
    request,
    signIn,
    clearSession: () => {
      cookie = "";
    },
    enableTwoFactor,
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
