/* oxlint-disable typescript/no-unsafe-type-assertion -- API response bodies are asserted in tests. */
import { describe, expect } from "vitest";

import { getRegistrationStatusRepository } from "../../../src/db/events";
import { issueStatusOtp } from "../../../src/events/services/status";
import type { TestDatabase } from "../helpers/d1";
import { test } from "./harness";

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
    const verified = (await verify.json()) as { data?: { token?: string } };

    expect(verify.status).toBe(200);
    expect(verified.data?.token).toBeTruthy();

    const status = await api.request("/api/events/status", {
      headers: { "x-status-token": verified.data?.token ?? "" },
    });
    const document = (await status.json()) as {
      data?: { registration?: { id: string } };
    };

    expect(status.status).toBe(200);
    expect(document.data?.registration?.id).toBe(registrationId);
  });

  test("returns 404 for an invalid status token", async ({ api }) => {
    const response = await api.request("/api/events/status", {
      headers: { "x-status-token": "A".repeat(43) },
    });

    expect(response.status).toBe(404);
  });

  test("rate limits status verification", async ({ api }) => {
    const { registrationId } = await seededRegistration(api.db, 0);
    api.limiters.status.allow = false;
    const response = await api.request("/api/events/status/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationId, code: "000000" }),
    });

    expect(response.status).toBe(429);
  });
});
