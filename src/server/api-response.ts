// @boundary server
import type { Context } from "hono";
import type { TypedResponse } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import type { ApiError, ApiIssue, ApiMeta, ApiResponse } from "~/shared/api/response";

const NO_STORE = { "cache-control": "no-store" };

export interface SuccessBody<TData, TMeta extends ApiMeta = ApiMeta> {
  status: "success";
  data: TData;
  error: null;
  meta: TMeta;
}
export type PartialBody<TData> = Extract<ApiResponse<TData>, { status: "partial" }>;
export type ErrorBody = Extract<ApiResponse<never>, { status: "error" }>;

type JsonResponse<TBody, TStatus extends ContentfulStatusCode> = Response &
  TypedResponse<JSONParsed<TBody>, TStatus, "json">;
type SuccessStatus = 200 | 201 | 202;
type ErrorStatus = Exclude<
  ContentfulStatusCode,
  200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226
>;

/**
 * `TStatus` is inferred from `options.status` so Hono RPC keeps the exact
 * literal instead of widening every endpoint to `200 | 201 | 202`. `TMeta`
 * preserves meta fields (e.g. `pagination`) as required for paginated routes.
 */
export function apiSuccess<
  TData,
  TStatus extends SuccessStatus = 200,
  TMeta extends ApiMeta = ApiMeta,
>(
  ctx: Context,
  data: TData,
  options?: {
    status?: TStatus;
    meta?: TMeta;
    headers?: Record<string, string>;
  },
): JsonResponse<SuccessBody<TData, TMeta>, TStatus>;
export function apiSuccess<TData>(
  ctx: Context,
  data: TData,
  options: {
    status?: SuccessStatus;
    meta?: ApiMeta;
    headers?: Record<string, string>;
  } = {},
): JsonResponse<SuccessBody<TData>, SuccessStatus> {
  const body: SuccessBody<TData> = {
    status: "success",
    data,
    error: null,
    meta: options.meta ?? {},
  };

  return ctx.json<SuccessBody<TData>, SuccessStatus>(body, options.status ?? 200, {
    ...NO_STORE,
    ...options.headers,
  });
}

// oxlint-disable-next-line eslint/max-params -- partial responses carry data, error, and options explicitly.
export function apiPartial<TData>(
  ctx: Context,
  data: TData,
  error: Omit<ApiError, "message"> & { message?: string },
  options: {
    meta?: ApiMeta;
    headers?: Record<string, string>;
  } = {},
): JsonResponse<PartialBody<TData>, 207> {
  const body: PartialBody<TData> = {
    status: "partial",
    data,
    error: { ...error, message: error.message ?? "" },
    meta: options.meta ?? {},
  };

  return ctx.json<PartialBody<TData>, 207>(body, 207, {
    ...NO_STORE,
    ...options.headers,
  });
}

export function apiError(
  ctx: Context,
  code: string,
  options: {
    status: ErrorStatus;
    fields?: string[];
    issues?: ApiIssue[];
    message?: string;
    headers?: Record<string, string>;
  },
) {
  const body: ErrorBody = {
    status: "error",
    data: null,
    error: {
      code,
      ...(options.message === undefined ? {} : { message: options.message }),
      ...(options.fields === undefined ? {} : { fields: options.fields }),
      ...(options.issues === undefined ? {} : { issues: options.issues }),
    },
    meta: {},
  };

  return ctx.json<ErrorBody, ErrorStatus>(body, options.status, {
    ...NO_STORE,
    ...options.headers,
  });
}
