// @boundary server
/* oxlint-disable eslint/require-await -- Hono middleware returns next(). */
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

import { can, type PermissionRequest } from "~/auth/permissions";
import { auth } from "~/auth/server/auth";
import { TWO_FACTOR_ROLES } from "~/auth/server/config";
import { apiError } from "~/server/api-response";
import { forbidden, unauthorized } from "~/server/common-responses";

type AuthSession = ReturnType<typeof auth>["$Infer"]["Session"];
type AuthEnv = HonoEnv & {
  Variables: {
    user: AuthSession["user"];
    session: AuthSession["session"];
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (ctx, next) => {
  const result = await auth(ctx.env).api.getSession({
    headers: ctx.req.raw.headers,
  });

  if (!result) {
    return unauthorized(ctx);
  }

  // Better Auth deletes the session cookie when an enrolled user still owes a
  // second factor, so they never reach this check. This guard only blocks staff
  // who have not enrolled yet; enrollment and sign-out are Better Auth routes
  // under /api/auth, which never pass through this middleware.
  if (TWO_FACTOR_ROLES.has(result.user.role ?? "") && result.user.twoFactorEnabled !== true) {
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
