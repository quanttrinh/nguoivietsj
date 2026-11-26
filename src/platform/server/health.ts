// @boundary server
import { Hono } from "hono";

/**
 * Cheap uptime endpoint. It deliberately runs one `SELECT 1` against each D1
 * database so a broken binding or missing migration is visible to monitors.
 */
export const health = new Hono<HonoEnv>().get("/", async (ctx) => {
  try {
    await Promise.all([
      ctx.env.APP_DB.prepare("SELECT 1").first(),
      ctx.env.EVENT_ENGINE_DB.prepare("SELECT 1").first(),
    ]);
  } catch {
    return ctx.json(
      { ok: false, app: false, events: false },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return ctx.json(
    { ok: true, app: true, events: true },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
});
