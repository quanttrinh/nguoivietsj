import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createEngineDb } from "~/db/events";
import { EVENT_LIST_CACHE_TAG } from "~/events/server/cache";
import { json } from "~/events/server/http";

export const prerender = false;

export const GET: APIRoute = async ({ cache }) => {
  if (cache.enabled) {
    cache.set({
      tags: [EVENT_LIST_CACHE_TAG],
    });
  }

  const events = await createEngineDb(env.EVENT_ENGINE_DB).events.listPublicSummaries(
    new Date().toISOString(),
  );

  return json({ events }, 200);
};
