/* oxlint-disable typescript/TS2740 -- Env is a generated Cloudflare binding interface; handlers only receive an opaque stub in this unit test. */
import { afterEach, describe, expect, test, vi } from "vitest";

import type { TwoFactorCodeEmailJob } from "~/auth/server/email/two-factor";
import type { EventEmailJob } from "~/events/services/email-queue";

const { isTwoFactorCodeEmailJob, handleTwoFactorCodeEmail, eventHandle } = vi.hoisted(() => ({
  isTwoFactorCodeEmailJob: vi.fn((job: { type: string }) => job.type === "auth.two_factor.code"),
  handleTwoFactorCodeEmail: vi.fn(),
  eventHandle: vi.fn(),
}));

vi.mock("~/auth/server/email/two-factor", () => ({
  isTwoFactorCodeEmailJob,
  handleTwoFactorCodeEmail,
}));

vi.mock("~/events/services/email-queue", () => ({
  eventEmailQueue: {
    dedupeKey: (job: { idempotencyKey: string }) => job.idempotencyKey,
    handle: eventHandle,
  },
}));

const { appEmailQueue } = await import("../../../../../src/server/services/email/app-queue");

type TestEnv = Record<string, unknown>;
const env: TestEnv = {};

afterEach(() => {
  vi.clearAllMocks();
});

describe("appEmailQueue", () => {
  test("dedupes jobs by their idempotency key", () => {
    const job: EventEmailJob = {
      type: "event.status.otp",
      idempotencyKey: "event.status.otp:reg-1:otp-1",
      email: "registrant@example.com",
      code: "123456",
      registrationId: "reg-1",
      otpId: "otp-1",
      expiresMinutes: 10,
    };

    expect(appEmailQueue.dedupeKey(job)).toBe("event.status.otp:reg-1:otp-1");
  });

  test("dispatches two-factor jobs to the auth email handler", async () => {
    const job: TwoFactorCodeEmailJob = {
      type: "auth.two_factor.code",
      idempotencyKey: "auth.two_factor.code:uuid",
      email: "staff@example.com",
      code: "123456",
      expiresMinutes: 10,
    };

    await appEmailQueue.handle(job, env);

    expect(isTwoFactorCodeEmailJob).toHaveBeenCalledExactlyOnceWith(job);
    expect(handleTwoFactorCodeEmail).toHaveBeenCalledExactlyOnceWith(job, env);
    expect(eventHandle).not.toHaveBeenCalled();
  });

  test("delegates event jobs to the event email queue", async () => {
    const job: EventEmailJob = {
      type: "event.registration.received",
      idempotencyKey: "event.registration.received:reg-1",
      eventId: "event-1",
      registrationId: "reg-1",
      statusUrl: "https://example.com/status",
      amountMinor: 2500,
    };

    await appEmailQueue.handle(job, env);

    expect(handleTwoFactorCodeEmail).not.toHaveBeenCalled();
    expect(eventHandle).toHaveBeenCalledExactlyOnceWith(job, env);
  });
});
