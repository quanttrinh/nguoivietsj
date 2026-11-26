import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";

import {
  emailFailureReason,
  enqueueEmail,
  isEmailQueue,
  NonRetryableEmailError,
  processEmailBatch,
  type EmailJob,
  type EmailQueueHandler,
} from "~/platform/server/email/queue";
import { EmailError } from "~/platform/server/email/types";
import { serverLogger } from "~/platform/server/logger";

interface TestJob extends EmailJob {
  idempotencyKey: string;
}

interface QueueMessage<TJob> {
  body: TJob;
  ack: Mock;
  retry: Mock;
}

interface QueueBatch<TJob> {
  queue: string;
  messages: QueueMessage<TJob>[];
  metadata: { id: string; timestamp: Date; attempt: number };
  ackAll: () => void;
  retryAll: () => void;
}

function job(type: string, idempotencyKey: string): TestJob {
  return { type, idempotencyKey };
}

function makeMessage(body: TestJob): QueueMessage<TestJob> {
  return { body, ack: vi.fn(), retry: vi.fn() };
}

function makeBatch(queue: string, messages: QueueMessage<TestJob>[]): QueueBatch<TestJob> {
  return {
    queue,
    messages,
    metadata: { id: "batch-1", timestamp: new Date("2026-11-19T00:00:00.000Z"), attempt: 1 },
    ackAll: vi.fn(() => undefined),
    retryAll: vi.fn(() => undefined),
  };
}

function makeQueue(send: Mock): { send: Mock; metrics: Mock; sendBatch: Mock } {
  return { send, metrics: vi.fn(), sendBatch: vi.fn() };
}

function makeHandler(): EmailQueueHandler<TestJob> {
  return {
    dedupeKey: (value) => value.idempotencyKey,
    handle: vi.fn().mockResolvedValue(undefined),
  };
}

let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logError = vi.spyOn(serverLogger, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NonRetryableEmailError", () => {
  test("is a named Error carrying the failure message", () => {
    const error = new NonRetryableEmailError("invalid grant");

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "NonRetryableEmailError", message: "invalid grant" });
  });
});

describe("emailFailureReason", () => {
  test.for([
    {
      label: "local config error",
      error: new EmailError("email_not_configured", 0, false),
      expected: "email_not_configured",
    },
    {
      label: "provider status",
      error: new EmailError("Mailtrap rejected the email (422)", 422, false),
      expected: "email_status_422",
    },
    { label: "plain Error", error: new TypeError("bad token"), expected: "TypeError" },
    { label: "string", error: "string failure", expected: "email_delivery_failed" },
    { label: "undefined", error: undefined, expected: "email_delivery_failed" },
  ])("maps a $label to $expected", ({ error, expected }) => {
    expect(emailFailureReason(error)).toBe(expected);
  });
});

describe("isEmailQueue", () => {
  test.for([
    { name: "production-emails", expected: true },
    { name: "staging-emails-dlq", expected: true },
    { name: "production-emails-archive", expected: false },
    { name: "emails", expected: false },
    { name: "production-email", expected: false },
  ])("$name -> $expected", ({ name, expected }) => {
    expect(isEmailQueue(name)).toBe(expected);
  });
});

describe("enqueueEmail", () => {
  test("reports failure when the queue binding is missing", async () => {
    await expect(enqueueEmail(undefined, job("event.status.otp", "key-1"))).resolves.toBe(false);
    expect(logError).toHaveBeenCalledWith(
      { type: "event.status.otp" },
      "Email queue binding is not configured",
    );
  });

  test("reports success when the queue accepts the job", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const queue = makeQueue(send);
    const value = job("auth.two_factor.code", "key-2");

    await expect(enqueueEmail(queue, value)).resolves.toBe(true);
    expect(send).toHaveBeenCalledExactlyOnceWith(value);
    expect(logError).not.toHaveBeenCalled();
  });

  test("reports failure and logs when the queue rejects the job", async () => {
    const rejection = new Error("queue down");
    const queue = makeQueue(vi.fn().mockRejectedValue(rejection));

    await expect(enqueueEmail(queue, job("auth.two_factor.code", "key-3"))).resolves.toBe(false);
    expect(logError).toHaveBeenCalledWith(
      { type: "auth.two_factor.code", error: rejection },
      "Failed to enqueue email job",
    );
  });
});

describe("processEmailBatch", () => {
  test("acknowledges dead-letter messages without handling them", async () => {
    const handler = makeHandler();
    const first = makeMessage(job("auth.two_factor.code", "dlq-1"));
    const second = makeMessage(job("event.status.otp", "dlq-2"));

    await processEmailBatch(makeBatch("production-emails-dlq", [first, second]), {}, handler);

    expect(handler.handle).not.toHaveBeenCalled();
    expect(first.ack).toHaveBeenCalledOnce();
    expect(second.ack).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith(
      { queue: "production-emails-dlq", count: 2 },
      "Email message reached the dead-letter queue",
    );
  });

  test("handles unique jobs, retries failures, and acknowledges duplicates", async () => {
    const handler = makeHandler();
    const failure = new Error("provider down");
    vi.mocked(handler.handle).mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const failed = makeMessage(job("auth.two_factor.code", "key"));
    const duplicate = makeMessage(job("auth.two_factor.code", "key"));
    const succeeded = makeMessage(job("event.status.otp", "other"));

    await processEmailBatch(
      makeBatch("production-emails", [failed, duplicate, succeeded]),
      {},
      handler,
    );

    expect(handler.handle).toHaveBeenCalledTimes(2);
    expect(failed.retry).toHaveBeenCalledOnce();
    expect(failed.ack).not.toHaveBeenCalled();
    expect(succeeded.ack).toHaveBeenCalledOnce();
    expect(duplicate.ack).toHaveBeenCalledOnce();
    expect(duplicate.retry).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      { type: "auth.two_factor.code", error: failure },
      "Email job failed",
    );
  });

  test("acknowledges jobs that fail permanently", async () => {
    const handler = makeHandler();
    vi.mocked(handler.handle).mockRejectedValue(new NonRetryableEmailError("invalid_grant"));
    const message = makeMessage(job("auth.two_factor.code", "key"));

    await processEmailBatch(makeBatch("production-emails", [message]), {}, handler);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      { type: "auth.two_factor.code", error: "invalid_grant" },
      "Email job failed permanently",
    );
  });

  test("acknowledges duplicates of a permanently failing job", async () => {
    const handler = makeHandler();
    vi.mocked(handler.handle).mockRejectedValueOnce(new NonRetryableEmailError("invalid_grant"));
    const first = makeMessage(job("auth.two_factor.code", "key"));
    const duplicate = makeMessage(job("auth.two_factor.code", "key"));

    await processEmailBatch(makeBatch("production-emails", [first, duplicate]), {}, handler);

    expect(first.ack).toHaveBeenCalledOnce();
    expect(duplicate.ack).toHaveBeenCalledOnce();
    expect(handler.handle).toHaveBeenCalledOnce();
  });

  test("does nothing for an empty batch", async () => {
    const handler = makeHandler();

    await processEmailBatch(makeBatch("production-emails", []), {}, handler);

    expect(handler.handle).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});
