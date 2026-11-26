// @boundary server
import { handle } from "@astrojs/cloudflare/handler";

import { runAppMaintenance } from "~/auth/server/maintenance";
import { runEventMaintenance } from "~/events/services/maintenance";
import { runMaintenance, type MaintenanceTask } from "~/maintenance";
import { api } from "~/server/app";
import { appEmailQueue } from "~/server/services/email/app-queue";
import { isEmailQueue, processEmailBatch } from "~/server/services/email/queue";

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
    const tasks: MaintenanceTask[] = [
      {
        name: "event-engine",
        run: (now) => runEventMaintenance(env.EVENT_ENGINE_DB, now),
      },
      {
        name: "app-auth",
        run: (now) => runAppMaintenance(env.APP_DB, now),
      },
    ];

    ctx.waitUntil(runMaintenance(tasks));
  },
} satisfies ExportedHandler<Env>;
