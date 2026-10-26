import { handle } from "@astrojs/cloudflare/handler";

import { eventEmailQueue } from "~/events/server/email-queue";
import { isEmailQueue, processEmailBatch } from "~/shared/server/email/queue";

export default {
  fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    return handle(request, env, context);
  },

  queue(batch: MessageBatch, env: Env): Promise<void> {
    if (isEmailQueue(batch.queue)) {
      return processEmailBatch(batch, env, eventEmailQueue);
    }

    for (const message of batch.messages) {
      message.ack();
    }

    return Promise.resolve();
  },
} satisfies ExportedHandler<Env>;
