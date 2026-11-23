// @boundary astro
import type { APIRoute } from "astro";

/**
 * Every page is prerendered, and @astrojs/cloudflare skips the Worker build
 * when no route renders on demand. This route keeps the Worker (and with it the
 * API, queue consumer and cron) in the build. `src/worker.ts` answers `/api/*`
 * with Hono before the Astro pipeline runs, so this handler is a fallback only.
 */
export const prerender = false;

export const ALL: APIRoute = () => new Response(null, { status: 500 });
