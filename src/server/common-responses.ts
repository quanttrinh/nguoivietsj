// @boundary server
/* oxlint-disable typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Response types are inferred for Hono RPC. */
import { type Context } from "hono";

import { apiError } from "./api-response";

export function notFound(ctx: Context) {
  return apiError(ctx, "not_found", { status: 404 });
}

export function forbidden(ctx: Context) {
  return apiError(ctx, "forbidden", { status: 403 });
}

export function unauthorized(ctx: Context) {
  return apiError(ctx, "unauthorized", { status: 401 });
}

export function badRequest(ctx: Context) {
  return apiError(ctx, "bad_request", { status: 400 });
}

export function internalServerError(ctx: Context) {
  return apiError(ctx, "internal_server_error", { status: 500 });
}

export function serviceUnavailable(ctx: Context) {
  return apiError(ctx, "service_unavailable", { status: 503 });
}

export function rateLimited(ctx: Context, retryAfterSeconds: number) {
  return apiError(ctx, "rate_limited", {
    status: 429,
    headers: { "retry-after": String(retryAfterSeconds) },
  });
}
