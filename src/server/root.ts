// @boundary server
import { Hono } from "hono";

import { BETTER_AUTH_BASE_PATH } from "~/auth/constants";

import { adminUsers } from "./routes/admin-users";
import { authRoutes } from "./routes/auth";
import { adminEvents } from "./routes/events/admin";
import { publicEvents } from "./routes/events/public";
import { eventStatus } from "./routes/events/status";
import { health } from "./routes/health";

export const root = new Hono<HonoEnv>()
  .route("/api/health", health)
  .route(BETTER_AUTH_BASE_PATH, authRoutes)
  .route("/api/admin/users", adminUsers)
  .route("/api/admin/events", adminEvents)
  .route("/api/events/status", eventStatus)
  .route("/api/events", publicEvents);

export type AppType = typeof root;
