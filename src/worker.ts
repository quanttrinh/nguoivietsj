// @boundary server
import { handle } from "@astrojs/cloudflare/handler";

import { eventEmailQueue } from "~/events/services/email-queue";
import { runScheduledMaintenance } from "~/events/services/maintenance";
import { isEmailQueue, processEmailBatch } from "~/server/services/email/queue";
import { serverLogger } from "~/shared/server/logger";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx);
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

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    const maintenance = async (): Promise<void> => {
      try {
        await runScheduledMaintenance(env.EVENT_ENGINE_DB);
      } catch (error: unknown) {
        serverLogger.error(
          { name: error instanceof Error ? error.name : "unknown" },
          "Failed to run scheduled maintenance",
        );
      }
    };

    ctx.waitUntil(maintenance());
  },
} satisfies ExportedHandler<Env>;
