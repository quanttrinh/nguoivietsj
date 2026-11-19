/* oxlint-disable typescript/no-unsafe-type-assertion, eslint/no-await-in-loop -- API bodies are asserted; each OTP attempt must persist before the next request. */
import { createHash } from "node:crypto";

import { describe, expect, onTestFinished, vi } from "vitest";

import { getRegistrationStatusRepository } from "../../../../src/db/events";
import { STATUS_OTP_MAX_ATTEMPTS } from "../../../../src/events/domain/status";
import { issueStatusOtp } from "../../../../src/events/services/status";
import type { TestDatabase } from "../../helpers/d1";
import { test, type ApiHarness } from "../harness";

const REGISTRATION_SLUG = "test-event-2027";
const TURNSTILE_URL = "https://turnstile.test/siteverify";

function registrationBody(email: string): Record<string, unknown> {
  return {
    fullName: "Throttling Test Person",
    contacts: [{ kind: "email", email, isConfirmation: true }],
    tickets: [{ key: "general", quantity: 1 }],
    consent: true,
    formVersion: 1,
  };
}

function postRegistration(
  api: ApiHarness,
  body: Record<string, unknown>,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) {
    headers["x-turnstile-token"] = token;
  }

  return api.request(`/api/events/${REGISTRATION_SLUG}/registrations`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };

  return body.error?.code;
}

async function countRows(db: TestDatabase, sql: string, ...params: unknown[]): Promise<number> {
  const row = await db.events
    .prepare(sql)
    .bind(...params)
    .first<{ count: number }>();
  expect.assert(row !== null, "expected a D1 row count");

  return row.count;
}

async function eventId(db: TestDatabase): Promise<string> {
  const row = await db.events
    .prepare("SELECT id FROM events WHERE slug = ?")
    .bind(REGISTRATION_SLUG)
    .first<{ id: string }>();
  expect.assert(row !== null, `expected seeded event ${REGISTRATION_SLUG}`);

  return row.id;
}

async function seededRegistration(
  db: TestDatabase,
  offset = 0,
): Promise<{ registrationId: string; email: string }> {
  const row = await db.events
    .prepare("SELECT id FROM registrations ORDER BY id LIMIT 1 OFFSET ?")
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

function otpRow(
  db: TestDatabase,
  id: string,
): Promise<{ attempts: number; consumed_at: string | null } | null> {
  return db.events
    .prepare("SELECT attempts, consumed_at FROM registration_status_otps WHERE id = ?")
    .bind(id)
    .first<{ attempts: number; consumed_at: string | null }>();
}

function countOtpRows(db: TestDatabase, registrationId: string): Promise<number> {
  return countRows(
    db,
    "SELECT COUNT(*) AS count FROM registration_status_otps WHERE registration_id = ?",
    registrationId,
  );
}

function countSessions(db: TestDatabase, registrationId: string): Promise<number> {
  return countRows(
    db,
    "SELECT COUNT(*) AS count FROM registration_status_sessions WHERE registration_id = ?",
    registrationId,
  );
}

function postVerify(api: ApiHarness, registrationId: string, code: string): Promise<Response> {
  return api.request("/api/events/status/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ registrationId, code }),
  });
}

function targetUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

/** Replace only the Turnstile siteverify call; keep the harness's other fetch behavior. */
function stubTurnstile(success: boolean): void {
  const previousFetch = globalThis.fetch;

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    if (targetUrl(input).startsWith(TURNSTILE_URL)) {
      return Promise.resolve(
        Response.json({
          success,
          ...(success ? { action: "event-registration", hostname: "localhost" } : {}),
          ...(success ? {} : { "error-codes": ["invalid-input-response"] }),
        }),
      );
    }

    return previousFetch(input, init);
  });

  onTestFinished(() => {
    vi.stubGlobal("fetch", previousFetch);
  });
}

function cleanOtpState(api: ApiHarness, registrationId: string, tokenHashes: string[]): void {
  onTestFinished(async () => {
    await api.db.events
      .prepare("DELETE FROM registration_status_otps WHERE registration_id = ?")
      .bind(registrationId)
      .run();
    for (const hash of tokenHashes) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- cleanup runs sequentially on test finish.
      await api.db.events
        .prepare("DELETE FROM registration_status_sessions WHERE token_hash = ?")
        .bind(hash)
        .run();
    }
  });
}

describe("abuse controls enforced end-to-end", () => {
  test("registration flood returns 429 and leaves the registrations table unchanged", async ({
    api,
  }) => {
    const id = await eventId(api.db);
    const before = await countRows(
      api.db,
      "SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?",
      id,
    );

    onTestFinished(() => {
      api.limiters.registration.allow = true;
    });
    api.limiters.registration.allow = false;

    const response = await postRegistration(
      api,
      registrationBody("throttled-registration@example.com"),
      "test-token",
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await errorCode(response)).toBe("rate_limited");
    expect(
      await countRows(api.db, "SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?", id),
    ).toBe(before);
  });

  test.for([
    { label: "missing token", token: undefined, status: 403, code: "turnstile_required" },
    { label: "blank token", token: "  ", status: 403, code: "turnstile_required" },
    {
      label: "siteverify-rejected token",
      token: "test-token",
      reject: true,
      status: 403,
      code: "turnstile_required",
    },
    {
      label: "unconfigured secret",
      token: "test-token",
      noSecret: true,
      status: 500,
      code: "internal_server_error",
    },
  ])("blocks registration with a $label ($status)", async (flow, { api }) => {
    if (flow.reject === true) {
      stubTurnstile(false);
    }
    if (flow.noSecret === true) {
      const original = api.env.TURNSTILE_SECRET;
      onTestFinished(() => {
        api.env.TURNSTILE_SECRET = original;
      });
      api.env.TURNSTILE_SECRET = "";
    }

    const id = await eventId(api.db);
    const before = await countRows(
      api.db,
      "SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?",
      id,
    );
    const response = await postRegistration(
      api,
      registrationBody(`turnstile-${flow.label.replaceAll(" ", "-")}@example.com`),
      flow.token,
    );

    expect(response.status).toBe(flow.status);
    expect(await errorCode(response)).toBe(flow.code);
    expect(
      await countRows(api.db, "SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?", id),
    ).toBe(before);
  });

  test("a valid Turnstile token passes the challenge and reaches body validation", async ({
    api,
  }) => {
    const response = await postRegistration(
      api,
      { ...registrationBody("turnstile-valid@example.com"), fullName: "" },
      "test-token",
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("bad_request");
  });

  test("status request and verify throttling leaves D1 OTP and session counts unchanged", async ({
    api,
  }) => {
    const { registrationId, email } = await seededRegistration(api.db, 0);
    const otpsBefore = await countOtpRows(api.db, registrationId);
    const sessionsBefore = await countSessions(api.db, registrationId);

    onTestFinished(() => {
      api.limiters.status.allow = true;
    });
    api.limiters.status.allow = false;

    const request = await api.request("/api/events/status/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, email }),
    });
    const verify = await postVerify(api, registrationId, "000000");

    expect(request.status).toBe(429);
    expect(request.headers.get("retry-after")).toBe("60");
    expect(await errorCode(request)).toBe("rate_limited");
    expect(verify.status).toBe(429);
    expect(verify.headers.get("retry-after")).toBe("60");
    expect(await errorCode(verify)).toBe("rate_limited");
    expect(await countOtpRows(api.db, registrationId)).toBe(otpsBefore);
    expect(await countSessions(api.db, registrationId)).toBe(sessionsBefore);
  });

  test.for([
    { label: "sign-in", limiter: "signIn", path: "/api/auth/sign-in/email" },
    { label: "send OTP", limiter: "sendOtp", path: "/api/auth/two-factor/send-otp" },
    { label: "verify OTP", limiter: "verifyOtp", path: "/api/auth/two-factor/verify-otp" },
    {
      label: "verify backup code",
      limiter: "verifyOtp",
      path: "/api/auth/two-factor/verify-backup-code",
    },
  ] as const)("rate-limits the $label endpoint end-to-end", async (flow, { api }) => {
    onTestFinished(() => {
      api.limiters[flow.limiter].allow = true;
    });
    api.limiters[flow.limiter].allow = false;

    const response = await api.request(flow.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "dev-password" }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await errorCode(response)).toBe("rate_limited");
  });

  test("locks a status OTP after repeated wrong codes without creating a session", async ({
    api,
  }) => {
    const { registrationId } = await seededRegistration(api.db, 2);
    const issued = await issueStatusOtp(
      getRegistrationStatusRepository(api.db.events),
      registrationId,
    );
    expect(issued.ok).toBe(true);

    if (!issued.ok) {
      return;
    }

    cleanOtpState(api, registrationId, []);
    const sessionsBefore = await countSessions(api.db, registrationId);
    const codeNumber = Number(issued.otp.code);
    const wrongCodes = Array.from({ length: STATUS_OTP_MAX_ATTEMPTS }, (_, index) =>
      String((codeNumber + index + 1) % 1_000_000).padStart(6, "0"),
    );

    for (const code of wrongCodes) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each attempt must persist before the next read.
      const response = await postVerify(api, registrationId, code);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("event_code_invalid");
    }

    const locked = await otpRow(api.db, issued.otp.id);
    expect.assert(locked !== null, "expected the OTP row after failed attempts");
    expect(locked).toMatchObject({ attempts: STATUS_OTP_MAX_ATTEMPTS, consumed_at: null });
    expect(await countSessions(api.db, registrationId)).toBe(sessionsBefore);

    for (const code of [...wrongCodes.slice(0, 1), issued.otp.code]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each locked attempt must be checked separately.
      const response = await postVerify(api, registrationId, code);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("event_code_locked");
    }

    const afterLock = await otpRow(api.db, issued.otp.id);
    expect.assert(afterLock !== null, "expected the OTP row after lockout");
    expect(afterLock).toMatchObject({ attempts: STATUS_OTP_MAX_ATTEMPTS, consumed_at: null });
    expect(await countSessions(api.db, registrationId)).toBe(sessionsBefore);
  });

  test("rejects an OTP replay and a stale OTP code after a newer one is issued", async ({
    api,
  }) => {
    const { registrationId } = await seededRegistration(api.db, 3);
    const repository = getRegistrationStatusRepository(api.db.events);
    const first = await issueStatusOtp(repository, registrationId);
    expect(first.ok).toBe(true);

    if (!first.ok) {
      return;
    }

    const sessionsBefore = await countSessions(api.db, registrationId);
    const verify = await postVerify(api, registrationId, first.otp.code);
    const verified = (await verify.json()) as { data?: { token?: string } };
    const token = verified.data?.token ?? "";
    expect.assert(token.length > 0, "expected a status token from a valid OTP");
    cleanOtpState(api, registrationId, [createHash("sha256").update(token).digest("hex")]);

    expect(verify.status).toBe(200);
    const consumed = await otpRow(api.db, first.otp.id);
    expect.assert(consumed !== null, "expected the consumed OTP in D1");
    expect(consumed.consumed_at).not.toBeNull();
    expect(await countSessions(api.db, registrationId)).toBe(sessionsBefore + 1);

    const replay = await postVerify(api, registrationId, first.otp.code);
    expect(replay.status).toBe(400);
    expect(await errorCode(replay)).toBe("event_code_invalid");
    expect(await countSessions(api.db, registrationId)).toBe(sessionsBefore + 1);

    // Move the first OTP outside the resend window so a second issue is allowed.
    await api.db.events
      .prepare("UPDATE registration_status_otps SET created_at = ? WHERE id = ?")
      .bind("2020-01-01T00:00:00.000Z", first.otp.id)
      .run();
    const second = await issueStatusOtp(repository, registrationId);
    expect(second.ok).toBe(true);

    if (!second.ok) {
      return;
    }

    const freshBefore = await otpRow(api.db, second.otp.id);
    expect.assert(freshBefore !== null, "expected the newer OTP in D1");
    expect(freshBefore).toMatchObject({ attempts: 0, consumed_at: null });

    const stale = await postVerify(api, registrationId, first.otp.code);
    expect(stale.status).toBe(400);
    expect(await errorCode(stale)).toBe("event_code_invalid");

    expect(await countOtpRows(api.db, registrationId)).toBe(2);
    // A stale code is compared against the newest OTP, so the failed attempt is
    // charged to the active row without consuming it or creating a session.
    const freshAfter = await otpRow(api.db, second.otp.id);
    expect.assert(freshAfter !== null, "expected the newer OTP in D1");
    expect(freshAfter).toMatchObject({ attempts: 1, consumed_at: null });
    expect(await countSessions(api.db, registrationId)).toBe(sessionsBefore + 1);
  });
});
