// @boundary server
import {
  handleTwoFactorCodeEmail,
  isTwoFactorCodeEmailJob,
  type TwoFactorCodeEmailJob,
} from "~/auth/server/email/two-factor";
import { eventEmailQueue, type EventEmailJob } from "~/events/services/email-queue";
import type { EmailQueueHandler } from "~/server/services/email/queue";

/** Email jobs owned by the app shell rather than the event engine. */
export type AppEmailJob = EventEmailJob | TwoFactorCodeEmailJob;

/**
 * Queue dispatcher for the shared email queue.
 *
 * Event registration emails stay in the event engine; app-wide auth emails,
 * such as two-factor sign-in codes, are handled here.
 */
export const appEmailQueue: EmailQueueHandler<AppEmailJob> = {
  dedupeKey: (job) => job.idempotencyKey,
  handle: async (job, env) => {
    if (isTwoFactorCodeEmailJob(job)) {
      await handleTwoFactorCodeEmail(job, env);
      return;
    }

    await eventEmailQueue.handle(job, env);
  },
};
