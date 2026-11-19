import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { authPlugins, baseAuthConfig } from "../../../../src/auth/server/config";
import type { TwoFactorCodeEmailJob } from "../../../../src/auth/server/email/two-factor";
import { hashPassword } from "../../../../src/auth/server/password";
import { NonRetryableEmailError } from "../../../../src/server/services/email/queue";
import { EmailError } from "../../../../src/server/services/email/types";
import { serverLogger } from "../../../../src/shared/server/logger";

interface SentMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn<(env: unknown, message: SentMessage) => Promise<void>>(),
  isEmailConfigured: vi.fn<(env: unknown) => boolean>(),
  enqueueEmail: vi.fn<(queue: unknown, job: TwoFactorCodeEmailJob) => Promise<boolean>>(),
  claim: vi.fn<(key: string, type: string) => Promise<boolean>>(),
  markSent: vi.fn<(key: string) => Promise<void>>(),
  markFailed: vi.fn<(key: string, reason: string) => Promise<void>>(),
  getEmailDeliveryLedger: vi.fn<(db: unknown) => unknown>(),
}));

vi.mock("~/server/services/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/services/email")>();
  return {
    ...actual,
    sendEmail: mocks.sendEmail,
    isEmailConfigured: mocks.isEmailConfigured,
  };
});

vi.mock("~/server/services/email/queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/services/email/queue")>();
  return { ...actual, enqueueEmail: mocks.enqueueEmail };
});

vi.mock("~/server/services/email/deliveries", () => ({
  getEmailDeliveryLedger: mocks.getEmailDeliveryLedger,
}));

const {
  TWO_FACTOR_EMAIL_JOB,
  enqueueTwoFactorCodeEmail,
  handleTwoFactorCodeEmail,
  isTwoFactorCodeEmailJob,
} = await import("../../../../src/auth/server/email/two-factor");

const PASSWORD = "correct horse battery";
const BASE_URL = "http://localhost:4321";

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

// oxlint-disable-next-line typescript/explicit-function-return-type -- infer the concrete test auth instance.
function createTestAuth(sent: string[]) {
  return betterAuth({
    ...baseAuthConfig,
    rateLimit: { enabled: false },
    session: { ...baseAuthConfig.session, storeSessionInDatabase: true },
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      twoFactor: [],
    }),
    secret: "test-secret-test-secret-test-secret",
    baseURL: BASE_URL,
    plugins: authPlugins(({ otp }) => {
      sent.push(otp);
    }),
  });
}

// oxlint-disable-next-line typescript/explicit-function-return-type -- infer the concrete test auth instance.
async function setup() {
  const sent: string[] = [];
  const auth = createTestAuth(sent);

  const context = await auth.$context;
  const email = "staff@example.com";
  const user = await context.internalAdapter.createUser(
    {
      email,
      name: "Staff",
      emailVerified: true,
      role: "event_staff",
      twoFactorEnabled: true,
    },
    { method: "admin" },
  );

  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(PASSWORD),
  });

  return { auth, sent, email };
}

describe("two-factor sign-in", () => {
  test("requires a second step and accepts an emailed code", async () => {
    const { auth, sent, email } = await setup();
    const signIn = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    });
    const body: unknown = await signIn.json();

    expect(body).toMatchObject({ twoFactorRedirect: true });

    const headers = new Headers({ cookie: cookieHeader(signIn), origin: BASE_URL });

    await auth.api.sendTwoFactorOTP({ headers, body: {} });
    expect(sent).toHaveLength(1);

    const wrong = await auth.api.verifyTwoFactorOTP({
      headers,
      body: { code: sent[0] === "000000" ? "111111" : "000000" },
      asResponse: true,
    });
    expect(wrong.status).toBe(401);

    const verified = await auth.api.verifyTwoFactorOTP({
      headers,
      body: { code: sent[0] ?? "" },
      asResponse: true,
    });
    expect(verified.status).toBe(200);
    expect(cookieHeader(verified)).toContain("session_token");
  });
});

interface TestEnv {
  APP_DB: { name: string };
  EMAIL_QUEUE?: unknown;
}

const env: TestEnv = { APP_DB: { name: "app-db" } };
const queue = { send: vi.fn() };
const envWithQueue: TestEnv = { ...env, EMAIL_QUEUE: queue };
const input = { email: "staff@example.com", code: "123456", expiresMinutes: 3 };

let logError: ReturnType<typeof vi.spyOn>;

function makeJob(overrides: Partial<TwoFactorCodeEmailJob> = {}): TwoFactorCodeEmailJob {
  return {
    type: TWO_FACTOR_EMAIL_JOB,
    idempotencyKey: "auth.two_factor.code:test-key",
    ...input,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.getEmailDeliveryLedger.mockReturnValue({
    claim: mocks.claim,
    markSent: mocks.markSent,
    markFailed: mocks.markFailed,
  });
  mocks.claim.mockResolvedValue(true);
  mocks.markSent.mockResolvedValue(undefined);
  mocks.markFailed.mockResolvedValue(undefined);
  mocks.sendEmail.mockResolvedValue(undefined);
  mocks.isEmailConfigured.mockReturnValue(true);
  mocks.enqueueEmail.mockResolvedValue(true);
  logError = vi.spyOn(serverLogger, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isTwoFactorCodeEmailJob", () => {
  test.for([
    { type: TWO_FACTOR_EMAIL_JOB, expected: true },
    { type: "event.status.otp", expected: false },
  ])("recognizes $type as a two-factor code job: $expected", ({ type, expected }) => {
    expect(isTwoFactorCodeEmailJob({ type })).toBe(expected);
  });
});

describe("handleTwoFactorCodeEmail", () => {
  test("skips delivery when the ledger cannot claim the job", async () => {
    mocks.claim.mockResolvedValueOnce(false);
    const job = makeJob();

    await expect(handleTwoFactorCodeEmail(job, env)).resolves.toBeUndefined();

    expect(mocks.claim).toHaveBeenCalledExactlyOnceWith(job.idempotencyKey, job.type);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.markSent).not.toHaveBeenCalled();
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  test("sends the rendered code and marks the delivery as sent", async () => {
    const job = makeJob();

    await expect(handleTwoFactorCodeEmail(job, env)).resolves.toBeUndefined();

    expect(mocks.getEmailDeliveryLedger).toHaveBeenCalledExactlyOnceWith(env.APP_DB);
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.sendEmail.mock.calls[0]?.[0]).toBe(env);
    const message = mocks.sendEmail.mock.calls[0]?.[1];
    expect(message).toMatchObject({
      to: job.email,
      subject: `Người Việt SJ sign-in code: ${job.code}`,
    });
    expect(message?.html).toContain(job.code);
    expect(message?.text).toContain(`${job.expiresMinutes} minutes`);
    expect(mocks.markSent).toHaveBeenCalledExactlyOnceWith(job.idempotencyKey);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  test("records a permanent provider failure and rethrows as non-retryable", async () => {
    const job = makeJob();
    mocks.sendEmail.mockRejectedValueOnce(new EmailError("gmail", "invalid_grant", 0, false));

    await expect(handleTwoFactorCodeEmail(job, env)).rejects.toBeInstanceOf(NonRetryableEmailError);

    expect(mocks.markFailed).toHaveBeenCalledExactlyOnceWith(job.idempotencyKey, "invalid_grant");
    expect(mocks.markSent).not.toHaveBeenCalled();
  });

  test("records a retryable provider failure and rethrows the original error", async () => {
    const job = makeJob();
    const failure = new EmailError("mailtrap", "temporary outage", 503, true);
    mocks.sendEmail.mockRejectedValueOnce(failure);

    await expect(handleTwoFactorCodeEmail(job, env)).rejects.toBe(failure);

    expect(mocks.markFailed).toHaveBeenCalledExactlyOnceWith(
      job.idempotencyKey,
      "mailtrap_status_503",
    );
    expect(mocks.markSent).not.toHaveBeenCalled();
  });

  test("records an unexpected failure by error name and rethrows it", async () => {
    const job = makeJob();
    const failure = new TypeError("network down");
    mocks.sendEmail.mockRejectedValueOnce(failure);

    await expect(handleTwoFactorCodeEmail(job, env)).rejects.toBe(failure);

    expect(mocks.markFailed).toHaveBeenCalledExactlyOnceWith(job.idempotencyKey, "TypeError");
  });

  test("logs an Error raised while recording a failed delivery", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("send failed"));
    mocks.markFailed.mockRejectedValueOnce(new Error("ledger down"));

    await expect(handleTwoFactorCodeEmail(makeJob(), env)).rejects.toThrow("send failed");

    expect(logError).toHaveBeenCalledWith(
      { name: "Error" },
      "Failed to record two-factor email delivery failure",
    );
  });

  test("logs a non-Error raised while recording a failed delivery", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("send failed"));
    mocks.markFailed.mockRejectedValueOnce("ledger down");

    await expect(handleTwoFactorCodeEmail(makeJob(), env)).rejects.toThrow("send failed");

    expect(logError).toHaveBeenCalledWith(
      { name: "string" },
      "Failed to record two-factor email delivery failure",
    );
  });

  test("logs an Error raised while marking an email as delivered", async () => {
    mocks.markSent.mockRejectedValueOnce(new Error("ledger down"));

    await expect(handleTwoFactorCodeEmail(makeJob(), env)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(
      { name: "Error" },
      "Failed to mark two-factor email as delivered",
    );
  });

  test("logs a non-Error raised while marking an email as delivered", async () => {
    mocks.markSent.mockRejectedValueOnce("ledger down");

    await expect(handleTwoFactorCodeEmail(makeJob(), env)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(
      { name: "string" },
      "Failed to mark two-factor email as delivered",
    );
  });
});

describe("enqueueTwoFactorCodeEmail", () => {
  test("refuses to enqueue when email is not configured", async () => {
    mocks.isEmailConfigured.mockReturnValueOnce(false);

    await expect(enqueueTwoFactorCodeEmail(envWithQueue, input)).resolves.toBe(false);

    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      { type: TWO_FACTOR_EMAIL_JOB },
      "Email configuration is incomplete",
    );
  });

  test("queues a job with a fresh idempotency key when the queue accepts it", async () => {
    await expect(enqueueTwoFactorCodeEmail(envWithQueue, input)).resolves.toBe(true);

    expect(mocks.enqueueEmail).toHaveBeenCalledOnce();
    expect(mocks.enqueueEmail.mock.calls[0]?.[0]).toBe(queue);
    const queued = mocks.enqueueEmail.mock.calls[0]?.[1];
    expect(queued).toMatchObject({
      type: TWO_FACTOR_EMAIL_JOB,
      ...input,
    });
    expect(queued?.idempotencyKey).toMatch(/^auth\.two_factor\.code:.+/u);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  test("falls back to direct delivery when the queue rejects in development", async () => {
    mocks.enqueueEmail.mockResolvedValueOnce(false);

    await expect(enqueueTwoFactorCodeEmail(envWithQueue, input)).resolves.toBe(true);

    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.markSent).toHaveBeenCalledOnce();
  });

  test("returns the queue result without a development fallback in production", async () => {
    vi.stubEnv("DEV", false);
    mocks.enqueueEmail.mockResolvedValueOnce(false);

    await expect(enqueueTwoFactorCodeEmail(envWithQueue, input)).resolves.toBe(false);

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  test("delivers directly when no queue is bound in development", async () => {
    await expect(enqueueTwoFactorCodeEmail(env, input)).resolves.toBe(true);

    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
    expect(mocks.markSent).toHaveBeenCalledOnce();
  });

  test("reports failure when direct development delivery throws an Error", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("provider down"));

    await expect(enqueueTwoFactorCodeEmail(env, input)).resolves.toBe(false);

    expect(logError).toHaveBeenCalledWith(
      { type: TWO_FACTOR_EMAIL_JOB, error: "Error" },
      "Failed to deliver development two-factor email",
    );
  });

  test("reports failure with a fallback label for non-Error delivery failures", async () => {
    mocks.sendEmail.mockRejectedValueOnce("provider down");

    await expect(enqueueTwoFactorCodeEmail(env, input)).resolves.toBe(false);

    expect(logError).toHaveBeenCalledWith(
      { type: TWO_FACTOR_EMAIL_JOB, error: "email_delivery_failed" },
      "Failed to deliver development two-factor email",
    );
  });

  test("reports failure when no queue is bound outside development", async () => {
    vi.stubEnv("DEV", false);

    await expect(enqueueTwoFactorCodeEmail(env, input)).resolves.toBe(false);

    expect(mocks.enqueueEmail).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      { type: TWO_FACTOR_EMAIL_JOB },
      "Email queue binding is not configured",
    );
  });
});
