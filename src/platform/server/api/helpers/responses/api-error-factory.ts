// @boundary server
import type { Context } from "hono";

import {
  apiError,
  type ApiErrorOptions,
  type ErrorBody,
  type ErrorStatus,
  type JsonResponse,
} from "./api-response";

export type LocaleResolver = (request: Request) => string;
export type Catalog = Readonly<Record<string, string>>;

export type FeatureApiError<TCatalog extends Catalog> = <TStatus extends ErrorStatus>(
  ctx: Context,
  code: keyof TCatalog | string,
  options: Omit<ApiErrorOptions<TStatus>, "message"> & { message?: string | undefined },
) => JsonResponse<ErrorBody, TStatus>;

/**
 * Bind a feature's message catalog to a locale resolver once at module load.
 * The returned helper preserves Hono RPC's literal status typing.
 */
export function createFeatureApiError<TCatalog extends Catalog>(options: {
  catalog: (locale: string) => TCatalog;
  fallback: string;
  resolveLocale: LocaleResolver;
}): FeatureApiError<TCatalog> {
  const { catalog, fallback, resolveLocale } = options;

  return <TStatus extends ErrorStatus>(
    ctx: Context,
    code: keyof TCatalog | string,
    errorOptions: Omit<ApiErrorOptions<TStatus>, "message"> & { message?: string | undefined },
  ): JsonResponse<ErrorBody, TStatus> => {
    const plainCode = String(code);

    return apiError(ctx, plainCode, {
      ...errorOptions,
      message:
        errorOptions.message ??
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- test helpers pass a context without a request.
        catalog(ctx.req === undefined ? "default" : resolveLocale(ctx.req.raw))[plainCode] ??
        fallback,
    });
  };
}
