// @boundary server
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { sharedApiError } from "~/platform/server/api/helpers/responses/shared-api-error";

const MAX_API_BODY_BYTES = 1024 * 1024;

/** Reject request bodies over `maxSize` bytes with the API's localized 413 error. */
export function apiBodyLimit(maxSize: number = MAX_API_BODY_BYTES): MiddlewareHandler<HonoEnv> {
  return bodyLimit({
    maxSize,
    onError: (ctx) => sharedApiError(ctx, "payload_too_large", { status: 413 }),
  });
}
