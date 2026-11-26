// @boundary server
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { methodNotAllowed } from "hono/method-not-allowed";
import { secureHeaders } from "hono/secure-headers";

import { BETTER_AUTH_BASE_PATH } from "~/auth/constants";
import { CSP_HEADER_DIRECTIVES } from "~/shared/constants/csp";
import { serverLogger } from "~/shared/server/logger";

import { notFound as apiNotFound } from "./helpers/responses/common-responses";
import { apiBodyLimit } from "./middleware/body-limit";
import { adminUsers } from "./routes/admin-users";
import { authRoutes } from "./routes/auth";
import { adminEvents } from "./routes/events/admin";
import { publicEvents } from "./routes/events/public";
import { eventStatus } from "./routes/events/status";
import { health } from "./routes/health";

const isDev = import.meta.env.DEV;

const API_CSP_DIRECTIVES = {
  ...CSP_HEADER_DIRECTIVES,
  defaultSrc: ["'none'"],
  scriptSrc: ["'none'"],
  styleSrc: ["'none'"],
};

export const api = new Hono<HonoEnv>();

api.use(
  secureHeaders({
    contentSecurityPolicy: isDev
      ? { ...API_CSP_DIRECTIVES, frameAncestors: ["*"] }
      : API_CSP_DIRECTIVES,
    xContentTypeOptions: "nosniff",
    xFrameOptions: isDev ? false : "DENY",
    referrerPolicy: "no-referrer",
    permissionsPolicy: {
      camera: ["self"],
      microphone: ["none"],
      geolocation: ["none"],
    },
  }),
);
api.use(apiBodyLimit());
api.use(
  csrf({
    secFetchSite: ["same-origin", "none"],
    origin: (origin, ctx) =>
      ctx.req.header("sec-fetch-site") === "cross-site"
        ? false
        : origin === new URL(ctx.req.url).origin,
  }),
);
if (isDev) {
  api.use(
    logger((str) => {
      serverLogger.debug(str);
    }),
  );
}
api.use(methodNotAllowed({ app: api }));

api.use(async (ctx, next) => {
  // oxlint-disable-next-line node/callback-return -- the response is cloned after the downstream handler finishes.
  await next();
  ctx.res = new Response(ctx.res.body, ctx.res);
});

/** Route chain only — the RPC contract deliberately excludes middleware and 404 catch-alls. */
const routes = new Hono<HonoEnv>()
  .route("/api/health", health)
  .route(BETTER_AUTH_BASE_PATH, authRoutes)
  .route("/api/admin/users", adminUsers)
  .route("/api/admin/events", adminEvents)
  .route("/api/events/status", eventStatus)
  .route("/api/events", publicEvents);

export type AppType = typeof routes;

api.route("/", routes);

api.all("/api", (ctx) => apiNotFound(ctx));
api.all("/api/*", (ctx) => apiNotFound(ctx));
