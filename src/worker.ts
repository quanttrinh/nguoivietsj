// @boundary server
import { handle } from "@astrojs/cloudflare/handler";

import { runMaintenance as runAppMaintenance } from "~/auth/server/maintenance";
import { runMaintenance as runEventMaintenance } from "~/events/services/maintenance";
import { api } from "~/server/app";
import { appEmailQueue } from "~/server/services/email/app-queue";
import { isEmailQueue, processEmailBatch } from "~/server/services/email/queue";
import { serverLogger } from "~/shared/server/logger";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }

    return handle(request, env, ctx);
  },

  queue(batch: MessageBatch, env: Env): Promise<void> {
    if (isEmailQueue(batch.queue)) {
      return processEmailBatch(batch, env, appEmailQueue);
    }

    for (const message of batch.messages) {
      message.ack();
    }

    return Promise.resolve();
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    const maintenance = async (): Promise<void> => {
      const results = await Promise.allSettled([
        runEventMaintenance(env.EVENT_ENGINE_DB),
        runAppMaintenance(env.APP_DB),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          const error: unknown = result.reason;
          serverLogger.error(
            { name: error instanceof Error ? error.name : "unknown" },
            "Failed to run scheduled maintenance",
          );
        }
      }
    };

    ctx.waitUntil(maintenance());
  },
} satisfies ExportedHandler<Env>;
