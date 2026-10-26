import { defineMiddleware } from "astro:middleware";

import { matchLocalePath } from "~/shared/server/middleware/locale-path";
import { withSecurityHeaders } from "~/shared/server/middleware/security-headers";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const match = matchLocalePath(pathname);

  context.locals.user = null;

  if (match?.redirect) {
    const url = new URL(context.url);
    url.pathname = `/${[match.locale, ...match.rest].join("/")}`;
    return context.redirect(url.toString(), 302);
  }

  const response = await next();

  // Static assets are covered by the generated `_headers`.
  // The dev server injects inline scripts that a strict CSP would block.
  if (import.meta.env.DEV) {
    return response;
  }

  return withSecurityHeaders(response);
});
