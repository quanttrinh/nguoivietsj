// @boundary server
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";

import { can, type PermissionRequest } from "~/auth/permissions";
import { auth } from "~/auth/server/auth";
import { requiresTwoFactorEnrollment } from "~/auth/two-factor";
import { apiError } from "~/server/api-response";
import { forbidden, unauthorized } from "~/server/common-responses";
import { getTracing, withTracingSpan } from "~/server/tracing";

type AuthSession = ReturnType<typeof auth>["$Infer"]["Session"];
type AuthEnv = HonoEnv & {
  Variables: {
    user: AuthSession["user"];
    session: AuthSession["session"];
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (ctx, next) => {
  const result = await withTracingSpan({
    tracing: getTracing(ctx),
    name: "auth.get_session",
    attributes: { "auth.route": routePath(ctx, -1) || ctx.req.path },
    task: () =>
      auth(ctx.env).api.getSession({
        headers: ctx.req.raw.headers,
      }),
  });

  if (!result) {
    return unauthorized(ctx);
  }

  if (requiresTwoFactorEnrollment(result.user)) {
    return apiError(ctx, "two_factor_required", { status: 403 });
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
