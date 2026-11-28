// @boundary server
import type { Context } from "hono";

import { defaultLocale } from "~/platform/i18n";

import {
  apiError,
  type ApiErrorOptions,
  type ErrorBody,
  type ErrorStatus,
  type JsonResponse,
} from "./api-response";

export type LocaleResolver = (request: Request) => string;
export type Catalog = Readonly<Record<string, string>>;
export type Fallback = (locale: string) => string;

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
  fallback: Fallback;
  resolveLocale: LocaleResolver;
}): FeatureApiError<TCatalog> {
  const { catalog, fallback, resolveLocale } = options;

  return <TStatus extends ErrorStatus>(
    ctx: Context,
    code: keyof TCatalog | string,
    errorOptions: Omit<ApiErrorOptions<TStatus>, "message"> & { message?: string | undefined },
  ): JsonResponse<ErrorBody, TStatus> => {
    const plainCode = String(code);
    const locale = resolveLocale(ctx.req.raw);
    const messages = catalog(locale);
    const explicit = errorOptions.message;
    const hasExplicit = explicit !== undefined && explicit.trim().length > 0;
    const resolved = hasExplicit
      ? explicit
      : (messages[plainCode] ??
        messages.generic_error ??
        catalog(defaultLocale).generic_error ??
        fallback(locale));

    return apiError(ctx, plainCode, {
      ...errorOptions,
      message: resolved,
    });
  };
}
