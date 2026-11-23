// @boundary server
/* oxlint-disable eslint/no-await-in-loop -- Queue batches are processed sequentially to avoid D1 and Mailtrap bursts. */

import { serverLogger } from "~/shared/server/logger";

import { EmailError } from "./types";

/** App-wide email queue infrastructure. */

const EMAIL_QUEUE_SUFFIX = "-emails";
const EMAIL_DLQ_SUFFIX = "-emails-dlq";

/** A delivery failure that should be acknowledged instead of retried. */
export class NonRetryableEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableEmailError";
  }
}

export interface EmailJob {
  type: string;
}

export interface EmailQueueHandler<TJob extends EmailJob> {
  /** Stable key used to drop duplicate jobs inside one batch. */
  dedupeKey: (job: TJob) => string;
  handle: (job: TJob, env: Env) => Promise<void>;
}

/** Persist only non-PII diagnostic information for a failed delivery. */
export function emailFailureReason(error: unknown): string {
  if (error instanceof EmailError) {
    return error.status === 0 ? error.message : `email_status_${error.status}`;
  }

  return error instanceof Error ? error.name : "email_delivery_failed";
}

/** Match production and staging email queues without hardcoding each env name. */
export function isEmailQueue(name: string): boolean {
  return name.endsWith(EMAIL_QUEUE_SUFFIX) || name.endsWith(EMAIL_DLQ_SUFFIX);
}

function isEmailDlq(name: string) {
  return name.endsWith(EMAIL_DLQ_SUFFIX);
}

/** Enqueue one email job, returning false when the queue is unavailable or rejects it. */
export async function enqueueEmail<TJob extends EmailJob>(
  queue: Queue<TJob> | undefined,
  job: TJob,
): Promise<boolean> {
  if (queue === undefined) {
    serverLogger.error({ type: job.type }, "Email queue binding is not configured");
    return false;
  }

  try {
    await queue.send(job);
    return true;
  } catch (error) {
    serverLogger.error({ type: job.type, error }, "Failed to enqueue email job");
    return false;
  }
}

/**
 * Process an email batch with at-least-once delivery.
 *
 * The Cloudflare queue retries failed messages and moves exhausted messages to
 * the configured dead-letter queue. Dead-letter messages are acknowledged after
 * being logged so the DLQ itself does not retry forever.
 */
export async function processEmailBatch<TJob extends EmailJob>(
  batch: MessageBatch,
  env: Env,
  handler: EmailQueueHandler<TJob>,
): Promise<void> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Queue bodies are typed by their queue handler.
  const messages = batch as MessageBatch<TJob>;

  if (isEmailDlq(batch.queue)) {
    serverLogger.error(
      { queue: batch.queue, count: messages.messages.length },
      "Email message reached the dead-letter queue",
    );

    for (const message of messages.messages) {
      message.ack();
    }

    return;
  }

  const byKey = new Map<string, Message<TJob>>();
  const duplicates: Message<TJob>[] = [];

  for (const message of messages.messages) {
    const key = handler.dedupeKey(message.body);

    if (byKey.has(key)) {
      duplicates.push(message);
    } else {
      byKey.set(key, message);
    }
  }

  for (const message of byKey.values()) {
    try {
      await handler.handle(message.body, env);
      message.ack();
    } catch (error) {
      if (error instanceof NonRetryableEmailError) {
        serverLogger.error(
          { type: message.body.type, error: error.message },
          "Email job failed permanently",
        );
        message.ack();
      } else {
        serverLogger.error({ type: message.body.type, error }, "Email job failed");
        message.retry();
      }
    }
  }

  for (const message of duplicates) {
    message.ack();
  }
}
