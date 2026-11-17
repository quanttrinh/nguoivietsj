// @boundary server
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { apiError } from "~/server/api-response";

/** Reject request bodies over `maxSize` bytes with the API's localized 413 error. */
export function apiBodyLimit(maxSize: number): MiddlewareHandler<HonoEnv> {
  return bodyLimit({
    maxSize,
    onError: (ctx) => apiError(ctx, "payload_too_large", { status: 413 }),
  });
}

const MAX_API_BODY_BYTES = 1024 * 1024;

export function appBodyLimit(): MiddlewareHandler<HonoEnv> {
  return bodyLimit({
    maxSize: MAX_API_BODY_BYTES,
    onError: (ctx) =>
      ctx.req.path.startsWith("/api/")
        ? apiError(ctx, "payload_too_large", { status: 413 })
        : ctx.text("Payload Too Large", 413),
  });
}
