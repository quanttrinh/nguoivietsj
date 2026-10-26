import type { APIRoute } from "astro";

import { withSameOriginRoute } from "~/shared/server/api/route-decorators";
import { isAccessConfigured } from "~/shared/server/auth/access";

export const prerender = false;

export const POST: APIRoute = withSameOriginRoute(() => {
  if (isAccessConfigured()) {
    return Response.json(
      { redirect: "/cdn-cgi/access/logout" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
});
