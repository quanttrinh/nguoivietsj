// @boundary server
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { methodNotAllowed } from "hono/method-not-allowed";
import { secureHeaders } from "hono/secure-headers";

import { CSP_HEADER_DIRECTIVES } from "~/shared/constants/csp";
import { serverLogger } from "~/shared/server/logger";

import { notFound as apiNotFound } from "./common-responses";
import { appBodyLimit } from "./middleware/body-limit";
import { localizeApiErrors } from "./middleware/localize-api-errors";
import { root } from "./root";

const isDev = import.meta.env.DEV;

/** Hono app for every request under `/api`. */
export const api = new Hono<HonoEnv>();

api.use(localizeApiErrors());
api.use(appBodyLimit());
api.use(csrf({ secFetchSite: ["same-origin", "none"] }));
if (isDev) {
  api.use(
    logger((str) => {
      serverLogger.debug(str);
    }),
  );
}
api.use(methodNotAllowed({ app: api }));
api.use(
  secureHeaders({
    contentSecurityPolicy: isDev
      ? { ...CSP_HEADER_DIRECTIVES, frameAncestors: ["*"] }
      : CSP_HEADER_DIRECTIVES,
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

api.use(async (ctx, next) => {
  // oxlint-disable-next-line node/callback-return -- the response is cloned after the downstream handler finishes.
  await next();
  ctx.res = new Response(ctx.res.body, ctx.res);
});

api.route("/", root);

api.all("/api", (ctx) => apiNotFound(ctx));
api.all("/api/*", (ctx) => apiNotFound(ctx));
