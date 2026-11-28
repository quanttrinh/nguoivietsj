// @boundary server
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

import { can, type PermissionRequest } from "~/features/auth/permissions";
import { auth } from "~/features/auth/server/auth";
import { forbidden, unauthorized } from "~/platform/server/api/helpers/responses/common-responses";
import { getTracing, withTracingSpan } from "~/platform/server/api/helpers/tracing";

type AuthSession = ReturnType<typeof auth>["$Infer"]["Session"];
type AuthEnv = HonoEnv & {
  Variables: {
    user: AuthSession["user"];
    session: AuthSession["session"];
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (ctx, next) => {
  const task = () =>
    auth(ctx.env).api.getSession({
      headers: ctx.req.raw.headers,
      // Admin reads must be authoritative: a cached role or a session
      // revoked inside the 60s cookieCache window must not authorize.
      query: { disableCookieCache: true },
    });
  const tracing = getTracing(ctx);

  // Keep the span for diagnostics, but only compute route attributes when
  // tracing is available — otherwise unsampled requests pay for routePath.
  const result =
    tracing === undefined
      ? await task()
      : await withTracingSpan({
          tracing,
          name: "auth.get_session",
          attributes: { "auth.route": routePath(ctx, -1) || ctx.req.path },
          task,
        });

  if (!result) {
    return unauthorized(ctx);
  }

  ctx.set("user", result.user);
  ctx.set("session", result.session);

  return next();
});

export function requirePermission(permissions: PermissionRequest): MiddlewareHandler<AuthEnv> {
  return createMiddleware<AuthEnv>(async (ctx, next) => {
    const user = ctx.get("user");

    if (!can(user.role, permissions)) {
      return forbidden(ctx);
    }

    return next();
  });
}
