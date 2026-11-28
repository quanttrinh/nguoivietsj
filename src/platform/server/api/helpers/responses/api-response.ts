// @boundary server
import type { Context } from "hono";
import type { TypedResponse } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import { LOCALE_VARY, NO_STORE } from "~/platform/contracts/headers";
import type { ApiIssue, ApiMeta, ApiResponse } from "~/platform/contracts/response";

function errorHeaders(headers?: Record<string, string>): Record<string, string> {
  const vary = headers?.vary;

  return {
    ...NO_STORE,
    ...headers,
    vary: vary === undefined ? LOCALE_VARY.vary : `${vary}, ${LOCALE_VARY.vary}`,
  };
}

function responseHeaders(headers?: Record<string, string>): Record<string, string> {
  return { ...NO_STORE, ...headers };
}

export interface SuccessBody<TData, TMeta extends ApiMeta = ApiMeta> {
  status: "success";
  data: TData;
  error: null;
  meta: TMeta;
}
export type PartialBody<TData> = Extract<ApiResponse<TData>, { status: "partial" }>;
export type ErrorBody = Extract<ApiResponse<never>, { status: "error" }>;

export type JsonResponse<TBody, TStatus extends ContentfulStatusCode> = Response &
  TypedResponse<JSONParsed<TBody>, TStatus, "json">;
type SuccessStatus = 200 | 201 | 202;
export type ErrorStatus = Exclude<
  ContentfulStatusCode,
  200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226
>;

export interface ApiErrorOptions<TStatus extends ErrorStatus> {
  status: TStatus;
  message: string;
  fields?: string[] | undefined;
  issues?: ApiIssue[] | undefined;
  headers?: Record<string, string> | undefined;
}

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
  const warnings = options.meta?.warnings;
  const meta =
    warnings === undefined
      ? (options.meta ?? {})
      : {
          ...options.meta,
          warnings,
        };
  const body: SuccessBody<TData> = {
    status: "success",
    data,
    error: null,
    meta,
  };

  return ctx.json<SuccessBody<TData>, SuccessStatus>(
    body,
    options.status ?? 200,
    responseHeaders(options.headers),
  );
}

/** Build a partial response. The generic layer never invents text. */
// oxlint-disable-next-line eslint/max-params -- partial responses carry data, error, and options explicitly.
export function apiPartial<TData>(
  ctx: Context,
  data: TData,
  error: { code: string; message: string; issues?: ApiIssue[] },
  options: { meta?: ApiMeta; headers?: Record<string, string> } = {},
): JsonResponse<PartialBody<TData>, 207> {
  const body: PartialBody<TData> = {
    status: "partial",
    data,
    error: {
      code: error.code,
      message: error.message,
      ...(error.issues === undefined ? {} : { issues: error.issues }),
    },
    meta: options.meta ?? {},
  };

  return ctx.json<PartialBody<TData>, 207>(body, 207, errorHeaders(options.headers));
}

/** Build an error response. The generic layer never invents text or knows about catalogs. */
export function apiError<TStatus extends ErrorStatus>(
  ctx: Context,
  code: string,
  options: ApiErrorOptions<TStatus>,
): JsonResponse<ErrorBody, TStatus> {
  const { status, message, fields, issues, headers } = options;
  const error = {
    code,
    message,
    ...(fields === undefined ? {} : { fields }),
    ...(issues === undefined ? {} : { issues }),
  };
  const body: ErrorBody = { status: "error", data: null, error, meta: {} };

  return ctx.json<ErrorBody, TStatus>(body, status, errorHeaders(headers));
}
