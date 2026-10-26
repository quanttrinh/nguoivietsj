// @boundary server
/* oxlint-disable eslint/require-await, node/callback-return -- Hono middleware returns next(). */
import { type MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

import { can, type PermissionRequest } from "~/auth/permissions";
import { auth } from "~/server/auth";
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
