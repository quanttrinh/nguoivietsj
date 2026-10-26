// @boundary server
/* oxlint-disable import/no-default-export -- Cloudflare Worker entrypoint. */
import { actions, cache, middleware, notFound, pages, trailingSlash } from "astro/hono";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { logger } from "hono/logger";
import { methodNotAllowed } from "hono/method-not-allowed";
import { secureHeaders } from "hono/secure-headers";

import { apiError } from "./server/api-response";
import { notFound as apiNotFound } from "./server/common-responses";
import { localizeApiErrors } from "./server/middleware/localize-api-errors";
import { root } from "./server/root";
import { CSP_HEADER_DIRECTIVES } from "./shared/constants/csp";

const MAX_API_BODY_BYTES = 1024 * 1024;
const isDev = import.meta.env.DEV;

const app = new Hono<HonoEnv>();

app.use(localizeApiErrors());
app.use(
  bodyLimit({
    maxSize: MAX_API_BODY_BYTES,
    onError: (ctx) =>
      ctx.req.path.startsWith("/api/")
        ? apiError(ctx, "payload_too_large", { status: 413 })
        : ctx.text("Payload Too Large", 413),
  }),
);
app.use(csrf({ secFetchSite: ["same-origin", "none"] }));
app.use(logger());
app.use(methodNotAllowed({ app }));
app.use(
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

// Astro can return responses with immutable headers (for example its `/_image`
// endpoint). Hono's secureHeaders middleware mutates response headers after
// downstream handlers run, so replace the response with a mutable copy first.
app.use(async (ctx, next) => {
  // oxlint-disable-next-line node/callback-return -- the response is cloned after the downstream handler finishes.
  await next();
  ctx.res = new Response(ctx.res.body, ctx.res);
});

app.route("/", root);

// Keep unmatched API requests out of Astro so they get a JSON 404 instead of
// the rendered HTML 404 page.
app.all("/api", (ctx) => apiNotFound(ctx));
app.all("/api/*", (ctx) => apiNotFound(ctx));

// Run only the Astro pipeline features this project uses. Integration
// middleware (for example astro-intlayer's locale resolver) still needs the
// middleware handler; actions, sessions, and i18n are not configured.
app.use(trailingSlash());
app.use(actions());
app.use(notFound());
app.use(cache());
app.use(middleware());
app.use(pages());

const worker = {
  fetch(request: Request): Response | Promise<Response> {
    return app.fetch(request, env);
  },
};

export default worker;
