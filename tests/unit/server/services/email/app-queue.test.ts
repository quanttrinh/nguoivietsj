/* oxlint-disable typescript/TS2740 -- Env is a generated Cloudflare binding interface; handlers only receive an opaque stub in this unit test. */
import { afterEach, describe, expect, test, vi } from "vitest";

import type { OtpEmailJob } from "~/features/auth/server/email/otp";
import type { EventEmailJob } from "~/features/events/server/services/email-queue";

const { isOtpEmailJob, handleOtpEmail, eventHandle } = vi.hoisted(() => ({
  isOtpEmailJob: vi.fn((job: { type: string }) => job.type === "auth.two_factor.code"),
  handleOtpEmail: vi.fn(),
  eventHandle: vi.fn(),
}));

vi.mock("~/features/auth/server/email/otp", () => ({
  isOtpEmailJob,
  handleOtpEmail,
}));

vi.mock("~/features/events/server/services/email-queue", () => ({
  eventEmailQueue: {
    dedupeKey: (job: { idempotencyKey: string }) => job.idempotencyKey,
    handle: eventHandle,
  },
}));

const { appEmailQueue } = await import("~/platform/server/email/app-queue");

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

  test("dispatches OTP jobs to the auth email handler", async () => {
    const job: OtpEmailJob = {
      type: "auth.two_factor.code",
      idempotencyKey: "auth.two_factor.code:uuid",
      email: "staff@example.com",
      code: "123456",
      expiresMinutes: 10,
    };

    await appEmailQueue.handle(job, env);

    expect(isOtpEmailJob).toHaveBeenCalledExactlyOnceWith(job);
    expect(handleOtpEmail).toHaveBeenCalledExactlyOnceWith(job, env);
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

    expect(handleOtpEmail).not.toHaveBeenCalled();
    expect(eventHandle).toHaveBeenCalledExactlyOnceWith(job, env);
  });
});
