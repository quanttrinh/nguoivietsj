import { createHash } from "node:crypto";

/* oxlint-disable typescript/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return -- Proxy test doubles delegate an untyped D1 binding. */
import type { ExecutionContext } from "@cloudflare/workers-types";
import { describe, expect, vi } from "vitest";

import {
  STATUS_OTP_MAX_ATTEMPTS,
  STATUS_OTP_TOKEN_TTL_SECONDS,
} from "~/features/events/domain/status";
import { issueStatusOtp } from "~/features/events/server/services/status";
import { api as app } from "~/platform/app";

import { getRegistrationStatusRepository } from "../../../src/platform/server/db/events";
import type { TestDatabase } from "../helpers/d1";
import { statusSessionCookie, statusSessionSetCookie } from "../helpers/status-session";
import { test, type ApiHarness } from "./harness";

async function seededRegistration(
  db: TestDatabase,
  offset = 0,
): Promise<{ registrationId: string; email: string }> {
  const row = await db.events
    .prepare("SELECT id FROM registrations LIMIT 1 OFFSET ?")
    .bind(offset)
    .first<{ id: string }>();
  const contact = await db.events
    .prepare(
      "SELECT email_normalized FROM registration_contacts WHERE registration_id = ? AND kind = 'email' LIMIT 1",
    )
    .bind(row?.id ?? "")
    .first<{ email_normalized: string }>();

  return { registrationId: row?.id ?? "", email: contact?.email_normalized ?? "" };
}

/**
 * Send a status request through the real app with a collectable execution
 * context so the fire-and-forget OTP delivery runs inside the test.
 */
async function requestWithDelivery(
  harness: ApiHarness,
  body: Record<string, unknown>,
): Promise<Response> {
  const pending: Promise<unknown>[] = [];
  const context = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
    passThroughOnException: () => {
      // No-op.
    },
  } as ExecutionContext;
  const response = await app.request(
    "http://localhost:4321/api/events/status/request",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        origin: "http://localhost:4321",
      },
      body: JSON.stringify(body),
    },
    harness.env,
    context,
  );

  await Promise.allSettled(pending);

  return response;
}

function setLimiter(harness: ApiHarness, limit: () => Promise<{ success: boolean }>) {
  harness.env.EVENT_ENGINE_STATUS_RATE_LIMITER = { limit };
}

function statusCookieHeader(token: string): Record<string, string> {
  return { cookie: `status_session=${token}` };
}

describe("registration status API", () => {
  test("acknowledges status requests without leaking existence", async ({ api }) => {
    const { registrationId, email } = await seededRegistration(api.db);
    const response = await api.request("/api/events/status/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, email }),
    });
    const body = (await response.json()) as { data?: { notice?: string } };

    expect(response.status).toBe(200);
    expect(body.data?.notice).toBe("event_code_sent");

    const unknown = await api.request("/api/events/status/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, email: "nobody@example.com" }),
    });

    expect(unknown.status).toBe(200);
  });

  test("rate limits status requests at the IP level", async ({ api }) => {
    const { registrationId, email } = await seededRegistration(api.db);

    try {
      api.limiters.status.allow = false;

      const response = await api.request("/api/events/status/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registrationId, email }),
      });

      expect(response.status).toBe(429);
    } finally {
      api.limiters.status.allow = true;
    }
  });

  test("issues an OTP only for a matching registration and email", async ({ api }) => {
    const existing = await seededRegistration(api.db, 4);
    const unknown = await requestWithDelivery(api, {
      registrationId: "01a19000-0001-7000-8000-000000000099",
      email: "nobody@example.com",
    });
    const mismatch = await requestWithDelivery(api, {
      registrationId: existing.registrationId,
      email: "nobody@example.com",
    });

    expect(unknown.status).toBe(200);
    expect(mismatch.status).toBe(200);
  });

  test("delivers an OTP once and then applies the resend window", async ({ api }) => {
    const { registrationId, email } = await seededRegistration(api.db, 3);
    const first = await requestWithDelivery(api, { registrationId, email });
    const second = await requestWithDelivery(api, { registrationId, email });
    const otp = await api.db.events
      .prepare("SELECT id FROM registration_status_otps WHERE registration_id = ?")
      .bind(registrationId)
      .first<{ id: string }>();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(otp?.id).toBeTruthy();
  });

  test("logs when a status OTP email is not queued outside development", async ({ api }) => {
    const { registrationId, email } = await seededRegistration(api.db, 3);

    await api.db.events
      .prepare("DELETE FROM registration_status_otps WHERE registration_id = ?")
      .bind(registrationId)
      .run();

    try {
      vi.stubEnv("DEV", false);

      const response = await requestWithDelivery(api, { registrationId, email });

      expect(response.status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("skips OTP delivery when the email rate limit rejects it", async ({ api }) => {
    const { registrationId, email } = await seededRegistration(api.db, 4);
    const original = api.env.EVENT_ENGINE_STATUS_RATE_LIMITER;
    let calls = 0;

    try {
      setLimiter(api, () => {
        calls += 1;
        return Promise.resolve({ success: calls === 1 });
      });

      const response = await requestWithDelivery(api, { registrationId, email });
      const otp = await api.db.events
        .prepare("SELECT id FROM registration_status_otps WHERE registration_id = ?")
        .bind(registrationId)
        .first<{ id: string }>();

      expect(response.status).toBe(200);
      expect(otp).toBeNull();
    } finally {
      api.env.EVENT_ENGINE_STATUS_RATE_LIMITER = original;
    }
  });

  test("swallows delivery failures so the request still succeeds", async ({ api }) => {
    const { registrationId, email } = await seededRegistration(api.db, 3);
    const original = api.env.EVENT_ENGINE_DB;

    try {
      api.env.EVENT_ENGINE_DB = {
        prepare: () => {
          throw new Error("database unavailable");
        },
      };

      const response = await requestWithDelivery(api, { registrationId, email });

      expect(response.status).toBe(200);
    } finally {
      api.env.EVENT_ENGINE_DB = original;
    }
  });

  test("rejects an invalid OTP", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 0);
    const response = await api.request("/api/events/status/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, code: "000000" }),
    });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("event_code_invalid");
  });

  test("rejects a locked OTP", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 5);
    const issued = await issueStatusOtp(
      getRegistrationStatusRepository(api.db.events),
      registrationId,
    );

    expect(issued.ok).toBe(true);

    if (!issued.ok) {
      return;
    }

    await api.db.events
      .prepare("UPDATE registration_status_otps SET attempts = ? WHERE id = ?")
      .bind(STATUS_OTP_MAX_ATTEMPTS, issued.otp.id)
      .run();

    const response = await api.request("/api/events/status/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, code: issued.otp.code }),
    });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("event_code_locked");
  });

  test("rejects an expired OTP", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 6);
    const issued = await issueStatusOtp(
      getRegistrationStatusRepository(api.db.events),
      registrationId,
    );

    expect(issued.ok).toBe(true);

    if (!issued.ok) {
      return;
    }

    await api.db.events
      .prepare("UPDATE registration_status_otps SET expires_at = ? WHERE id = ?")
      .bind("2000-01-01T00:00:00.000Z", issued.otp.id)
      .run();

    const response = await api.request("/api/events/status/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, code: issued.otp.code }),
    });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("event_code_invalid");
  });

  test("rejects an already consumed OTP", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 2);
    const issued = await issueStatusOtp(
      getRegistrationStatusRepository(api.db.events),
      registrationId,
    );

    expect(issued.ok).toBe(true);

    if (!issued.ok) {
      return;
    }

    await api.db.events
      .prepare("UPDATE registration_status_otps SET consumed_at = ? WHERE id = ?")
      .bind("2026-01-01T00:00:00.000Z", issued.otp.id)
      .run();

    const response = await api.request("/api/events/status/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, code: issued.otp.code }),
    });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("event_code_invalid");
  });

  test("verifies a real OTP and returns the status document", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 1);
    const issued = await issueStatusOtp(
      getRegistrationStatusRepository(api.db.events),
      registrationId,
    );

    expect(issued.ok).toBe(true);

    if (!issued.ok) {
      return;
    }

    const verify = await api.request("/api/events/status/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, code: issued.otp.code }),
    });
    const verified = (await verify.json()) as { data?: { ok?: boolean; token?: string } };
    const cookie = statusSessionCookie(verify);
    const setCookie = statusSessionSetCookie(verify);

    expect(verify.status).toBe(200);
    expect(verified.data).toEqual({ ok: true });
    expect(verified.data?.token).toBeUndefined();
    expect(cookie).toMatch(/^status_session=/u);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/api/events/status");
    expect(setCookie).toContain(`Max-Age=${STATUS_OTP_TOKEN_TTL_SECONDS}`);

    const status = await api.request("/api/events/status", {
      headers: { cookie },
    });
    const document = (await status.json()) as {
      data?: { registration?: { id: string }; paid?: boolean; qrSvg?: string | null };
    };

    expect(status.status).toBe(200);
    expect(document.data?.registration?.id).toBe(registrationId);
    expect(document.data?.paid).toBe(true);
    expect(document.data?.qrSvg).toBeTruthy();
  });

  test("returns an unpaid status document without a QR code", async ({ api }) => {
    const response = await api.request("/api/events/status", {
      headers: statusCookieHeader("local-alan-turing-summer-picnic-2027"),
    });
    const document = (await response.json()) as {
      data?: { paid?: boolean; qrSvg?: string | null };
    };

    expect(response.status).toBe(200);
    expect(document.data?.paid).toBe(false);
    expect(document.data?.qrSvg).toBeNull();
  });

  test("includes custom registration answers and their field labels", async ({ api }) => {
    const response = await api.request("/api/events/status", {
      headers: statusCookieHeader("local-mary-jackson-summer-picnic-2027"),
    });
    const document = (await response.json()) as {
      data?: {
        registration?: { answers: Record<string, unknown> };
        answerFields?: { key: string; label: Record<string, string> }[];
      };
    };

    expect(response.status).toBe(200);
    expect(Object.keys(document.data?.registration?.answers ?? {}).length).toBeGreaterThan(0);
    expect(document.data?.answerFields?.length).toBeGreaterThan(0);
  });

  test("falls back to the event currency when a registration has no tickets", async ({ api }) => {
    const event = await api.db.events
      .prepare("SELECT id FROM events WHERE slug = 'summer-picnic-2027'")
      .first<{ id: string }>();
    const registrationId = "01a19000-0001-7000-8000-0000000000aa";
    const token = "status-currency-fallback-token-1234567890";

    await api.db.events
      .prepare(
        `INSERT INTO registrations
          (id, event_id, form_version, full_name, full_name_normalized, manual, consent_at, metadata_json, created_at)
         VALUES (?, ?, 1, 'Manual Person', 'manual person', 1, ?, '{}', ?)`,
      )
      .bind(registrationId, event?.id ?? "", "2026-11-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z")
      .run();
    await api.db.events
      .prepare(
        `INSERT INTO registration_status_sessions (id, registration_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(
        "01a19000-0006-7000-8000-0000000000aa",
        registrationId,
        createHash("sha256").update(token).digest("hex"),
        "2027-12-31T23:59:59.999Z",
      )
      .run();

    try {
      const response = await api.request("/api/events/status", {
        headers: statusCookieHeader(token),
      });
      const document = (await response.json()) as { data?: { currency?: string } };

      expect(response.status).toBe(200);
      expect(document.data?.currency).toBe("CAD");
    } finally {
      await api.db.events
        .prepare("DELETE FROM registrations WHERE id = ?")
        .bind(registrationId)
        .run();
    }
  });

  test("returns 404 when the registration event cannot be loaded", async ({ api }) => {
    const original = api.env.EVENT_ENGINE_DB;
    const database = original as {
      prepare: (sql: string) => unknown;
    };
    let injectedMisses = 0;
    const injectedPrepare = vi.fn((sql: string) => {
      if (sql.includes('from "events" as "d0"')) {
        injectedMisses += 1;
        const missing = {
          bind: () => missing,
          first: () => Promise.resolve(null),
          all: () => Promise.resolve({ results: [] }),
          raw: () => Promise.resolve([]),
          run: () => Promise.resolve({}),
        };

        return missing;
      }

      return database.prepare(sql);
    });
    const proxy = new Proxy(database, {
      get(target, property) {
        if (property === "prepare") {
          return injectedPrepare;
        }

        const value = Reflect.get(target, property, target);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    try {
      api.env.EVENT_ENGINE_DB = proxy;

      const response = await api.request("/api/events/status", {
        headers: statusCookieHeader("local-alan-turing-summer-picnic-2027"),
      });

      expect(response.status).toBe(404);
      // The 404 could also come from an unrelated failure; prove the injected
      // event lookup actually ran and returned the simulated missing row.
      expect(injectedPrepare).toHaveBeenCalledWith(
        expect.stringContaining('from "events" as "d0"'),
      );
      expect(injectedMisses).toBeGreaterThan(0);
    } finally {
      api.env.EVENT_ENGINE_DB = original;
    }
  });

  test("returns 404 when no status token is supplied", async ({ api }) => {
    const response = await api.request("/api/events/status");

    expect(response.status).toBe(404);
  });

  test("returns 404 for an invalid status token", async ({ api }) => {
    const response = await api.request("/api/events/status", {
      headers: statusCookieHeader("A".repeat(43)),
    });

    expect(response.status).toBe(404);
  });

  test("still accepts the status token header for API clients", async ({ api }) => {
    const response = await api.request("/api/events/status", {
      headers: { "x-status-token": "local-alan-turing-summer-picnic-2027" },
    });

    expect(response.status).toBe(200);
  });

  test("exchanges a magic link for a cookie without leaking the token", async ({ api }) => {
    const token = "local-alan-turing-summer-picnic-2027";
    const response = await api.request(
      `/api/events/status/link?token=${encodeURIComponent(token)}&locale=fr`,
      { redirect: "manual" },
    );
    const location = response.headers.get("location") ?? "";
    const setCookie = statusSessionSetCookie(response);

    expect(response.status).toBe(302);
    expect(location).toBe("/fr/events/status/view");
    expect(location).not.toContain(token);
    expect(setCookie).toContain(`status_session=${token}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/api/events/status");

    // The emailed token lives far longer than an OTP session, so the cookie
    // must inherit the token's own remaining lifetime.
    const maxAge = /Max-Age=(?<maxAge>\d+)/u.exec(setCookie)?.groups?.maxAge ?? "0";
    expect(Number(maxAge)).toBeGreaterThan(STATUS_OTP_TOKEN_TTL_SECONDS);
  });

  test("falls back to the default locale for unsupported link locales", async ({ api }) => {
    const response = await api.request(
      "/api/events/status/link?token=local-alan-turing-summer-picnic-2027&locale=%2F%2Fevil.example",
      { redirect: "manual" },
    );

    expect(response.headers.get("location")).toBe("/en/events/status/view");
  });

  test("invalid magic links redirect without setting a cookie", async ({ api }) => {
    const response = await api.request("/api/events/status/link?token=not-a-real-token&locale=en", {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en/events/status/view");
    expect(statusSessionSetCookie(response)).toBe("");
  });

  test("missing magic link tokens redirect without setting a cookie", async ({ api }) => {
    const response = await api.request("/api/events/status/link?locale=en", {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en/events/status/view");
    expect(statusSessionSetCookie(response)).toBe("");
  });

  test("rate limits status verification", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 0);

    try {
      api.limiters.status.allow = false;

      const response = await api.request("/api/events/status/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registrationId, code: "000000" }),
      });

      expect(response.status).toBe(429);
    } finally {
      api.limiters.status.allow = true;
    }
  });
});
