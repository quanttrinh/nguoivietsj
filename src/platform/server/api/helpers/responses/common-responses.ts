// @boundary server
import type { Context } from "hono";

import type { ErrorBody, JsonResponse } from "./api-response";
import { sharedApiError } from "./shared-api-error";

export function notFound(ctx: Context): JsonResponse<ErrorBody, 404> {
  return sharedApiError(ctx, "not_found", { status: 404 });
}

export function forbidden(ctx: Context): JsonResponse<ErrorBody, 403> {
  return sharedApiError(ctx, "forbidden", { status: 403 });
}

export function unauthorized(ctx: Context): JsonResponse<ErrorBody, 401> {
  return sharedApiError(ctx, "unauthorized", { status: 401 });
}

export function badRequest(ctx: Context): JsonResponse<ErrorBody, 400> {
  return sharedApiError(ctx, "bad_request", { status: 400 });
}

export function internalServerError(ctx: Context): JsonResponse<ErrorBody, 500> {
  return sharedApiError(ctx, "internal_server_error", { status: 500 });
}

export function serviceUnavailable(ctx: Context): JsonResponse<ErrorBody, 503> {
  return sharedApiError(ctx, "service_unavailable", { status: 503 });
}

export function rateLimited(ctx: Context, retryAfterSeconds: number): JsonResponse<ErrorBody, 429> {
  return sharedApiError(ctx, "rate_limited", {
    status: 429,
    headers: { "retry-after": String(retryAfterSeconds) },
  });
}
