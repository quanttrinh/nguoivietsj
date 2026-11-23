// @boundary server
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { methodNotAllowed } from "hono/method-not-allowed";
import { secureHeaders } from "hono/secure-headers";

import { CSP_HEADER_DIRECTIVES } from "~/shared/constants/csp";
import { serverLogger } from "~/shared/server/logger";

import { notFound as apiNotFound } from "./common-responses";
import { apiBodyLimit } from "./middleware/body-limit";
import { localizeApiErrors } from "./middleware/localize-api-errors";
import { root } from "./root";

const isDev = import.meta.env.DEV;

/** API responses are JSON, so no script, style, or fetch source is needed. */
const API_CSP_DIRECTIVES = {
  ...CSP_HEADER_DIRECTIVES,
  defaultSrc: ["'none'"],
  scriptSrc: ["'none'"],
  styleSrc: ["'none'"],
};

/** Hono app for every request under `/api`. */
export const api = new Hono<HonoEnv>();

// Security headers must be outermost so early rejections (CSRF 403, body
// limit 413) carry them too. Hono applies them after downstream middleware
// returns, so registering this first still decorates the final response.
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
api.use(localizeApiErrors());
api.use(apiBodyLimit());
api.use(
  csrf({
    secFetchSite: ["same-origin", "none"],
    // Hono's csrf passes when *either* signal is trusted. A cross-site fetch
    // must never be accepted just because the request carries a same-origin
    // Origin header, so veto the origin check in that case.
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

api.route("/", root);

api.all("/api", (ctx) => apiNotFound(ctx));
api.all("/api/*", (ctx) => apiNotFound(ctx));
