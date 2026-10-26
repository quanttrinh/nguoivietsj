// @boundary server
import { Hono } from "hono";

import { BETTER_AUTH_BASE_PATH } from "~/shared/constants/auth";

import { auth } from "./auth";
import { adminUsers } from "./routes/admin-users";
import { adminEvents } from "./routes/events/admin";
import { publicEvents } from "./routes/events/public";
import { eventStatus } from "./routes/events/status";
import { turnstile } from "./routes/turnstile";

export const root = new Hono<HonoEnv>()
  .route("/api/turnstile", turnstile)
  .on(["GET", "POST"], `${BETTER_AUTH_BASE_PATH}/*`, (ctx) => auth(ctx.env).handler(ctx.req.raw))
  .route("/api/admin/users", adminUsers)
  .route("/api/admin/events", adminEvents)
  .route("/api/events/status", eventStatus)
  .route("/api/events", publicEvents);

export type AppType = typeof root;
