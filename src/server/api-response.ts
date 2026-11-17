// @boundary server
/* oxlint-disable typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- Response helpers stay inferred for Hono RPC. */
import type { Context } from "hono";
import type { TypedResponse } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import type { ApiError, ApiIssue, ApiMeta } from "~/shared/api/response";

const NO_STORE = { "cache-control": "no-store" };

export interface SuccessBody<TData> {
  status: "success";
  data: TData;
  error: null;
  meta: ApiMeta;
}

export interface PartialBody<TData> {
  status: "partial";
  data: TData;
  error: ApiError;
  meta: ApiMeta;
}

export interface ErrorBody {
  status: "error";
  data: null;
  error: ApiError;
  meta: ApiMeta;
}

type JsonResponse<TBody, TStatus extends ContentfulStatusCode> = Response &
  TypedResponse<JSONParsed<TBody>, TStatus, "json">;
type ErrorStatus = Exclude<
  ContentfulStatusCode,
  200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226
>;

export function apiSuccess<TData>(
  ctx: Context,
  data: TData,
  options: {
    status?: 200 | 201 | 202;
    meta?: ApiMeta;
    headers?: Record<string, string>;
  } = {},
): JsonResponse<SuccessBody<TData>, 200 | 201 | 202> {
  const body: SuccessBody<TData> = {
    status: "success",
    data,
    error: null,
    meta: options.meta ?? {},
  };

  return ctx.json<SuccessBody<TData>, 200 | 201 | 202>(body, options.status ?? 200, {
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
