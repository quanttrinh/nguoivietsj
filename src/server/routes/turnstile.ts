// @boundary server
import { Hono } from "hono";

import { requireTurnstile } from "../middleware/turnstle";

export const turnstile = new Hono<HonoEnv>().post(
  "/turnstile/verify",
  requireTurnstile("turnstile-api-verify"),
  (ctx) => ctx.body(null, 204),
);
