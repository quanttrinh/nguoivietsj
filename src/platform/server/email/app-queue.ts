// @boundary server
import { handleOtpEmail, isOtpEmailJob, type OtpEmailJob } from "~/features/auth/server/email/otp";
import { eventEmailQueue, type EventEmailJob } from "~/features/events/server/services/email-queue";
import type { EmailQueueHandler } from "~/platform/server/email/queue";

/** Email jobs owned by the app shell rather than the event engine. */
export type AppEmailJob = EventEmailJob | OtpEmailJob;

/**
 * Queue dispatcher for the shared email queue.
 *
 * Event registration emails stay in the event engine; app-wide auth emails,
 * such as email one-time sign-in codes, are handled here.
 */
export const appEmailQueue: EmailQueueHandler<AppEmailJob> = {
  dedupeKey: (job) => job.idempotencyKey,
  handle: async (job, env) => {
    if (isOtpEmailJob(job)) {
      await handleOtpEmail(job, env);
      return;
    }

    await eventEmailQueue.handle(job, env);
  },
};
