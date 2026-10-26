/* oxlint-disable eslint/no-await-in-loop -- Queue batches are processed sequentially to avoid D1 and Mailtrap bursts. */

/** App-wide email queue infrastructure. */

export const EMAIL_QUEUE_NAME = "nguoivietsj-emails";
export const EMAIL_DLQ_NAME = "nguoivietsj-emails-dlq";

export interface EmailJob {
  type: string;
}

export interface EmailQueueHandler<TJob extends EmailJob> {
  /** Stable key used to drop duplicate jobs inside one batch. */
  dedupeKey: (job: TJob) => string;
  handle: (job: TJob, env: Env) => Promise<void>;
}

/** Match production and staging email queues without hardcoding each env name. */
export function isEmailQueue(name: string): boolean {
  return (
    name === EMAIL_QUEUE_NAME ||
    name === EMAIL_DLQ_NAME ||
    name.endsWith("-emails") ||
    name.endsWith("-emails-dlq")
  );
}

export function isEmailDlq(name: string): boolean {
  return name === EMAIL_DLQ_NAME || name.endsWith("-emails-dlq");
}

/** Enqueue one email job, returning false when the queue is unavailable or rejects it. */
export async function enqueueEmail<TJob extends EmailJob>(
  queue: Queue<TJob> | undefined,
  job: TJob,
): Promise<boolean> {
  if (queue === undefined) {
    console.error("Email queue binding is not configured", { type: job.type });
    return false;
  }

  try {
    await queue.send(job);
    return true;
  } catch (error) {
    console.error("Failed to enqueue email job", { type: job.type, error });
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
  const messages = batch as MessageBatch<TJob>;

  if (isEmailDlq(batch.queue)) {
    console.error("Email message reached the dead-letter queue", {
      queue: batch.queue,
      count: messages.messages.length,
    });

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
      console.error("Email job failed", { type: message.body.type, error });
      message.retry();
    }
  }

  for (const message of duplicates) {
    message.ack();
  }
}
