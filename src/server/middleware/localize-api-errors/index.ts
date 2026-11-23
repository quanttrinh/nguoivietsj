// @boundary server
import { type as ark } from "arktype";
import { createMiddleware } from "hono/factory";

import { isRecord } from "~/shared/utils/records";

import { apiMessage, resolveRequestLocale } from "./api-messages";

/**
 * Our own API responses use the standard `{ status, data, error, meta }`
 * envelope; Better Auth still uses `{ code, message }`.
 */
const legacyErrorBodySchema = ark({
  "error?": "string",
  "code?": "string",
  "message?": "string",
}).and(ark("Record<string, unknown>"));

function localizeEnvelope(
  body: Record<string, unknown>,
  locale: string,
): Record<string, unknown> | null {
  let changed = false;
  let next = body;

  if ((body.status === "error" || body.status === "partial") && isRecord(body.error)) {
    const error = body.error;

    if (
      typeof error.code === "string" &&
      !(typeof error.message === "string" && error.message.length > 0)
    ) {
      next = { ...next, error: { ...error, message: apiMessage(error.code, locale) } };
      changed = true;
    }
  }

  if (isRecord(body.meta) && Array.isArray(body.meta.warnings)) {
    const warnings = body.meta.warnings.map((warning: unknown) => {
      if (
        isRecord(warning) &&
        typeof warning.code === "string" &&
        !(typeof warning.message === "string" && warning.message.length > 0)
      ) {
        changed = true;

        return { ...warning, message: apiMessage(warning.code, locale) };
      }

      return warning;
    });

    if (changed) {
      next = { ...next, meta: { ...body.meta, warnings } };
    }
  }

  return changed ? next : null;
}

function localizeLegacy(body: Record<string, unknown>, locale: string, status: number) {
  const parsed = legacyErrorBodySchema(body);

  if (parsed instanceof ark.errors) {
    return null;
  }

  if (parsed.error !== undefined && parsed.message !== undefined) {
    return null;
  }

  const code = parsed.code ?? parsed.error ?? (status === 429 ? "rate_limited" : null);

  return code === null ? null : { ...parsed, message: apiMessage(code, locale) };
}

/**
 * Add localized `message` fields to JSON API errors, partial errors, and
 * warnings without changing stable error/warning codes.
 */
export function localizeApiErrors() {
  return createMiddleware<HonoEnv>(async (ctx, next) => {
    // oxlint-disable-next-line node/callback-return -- middleware continues after the downstream handler.
    await next();

    const response = ctx.res;

    if (
      !(response.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false)
    ) {
      return;
    }

    let body: unknown;

    try {
      body = await response.clone().json();
    } catch {
      return;
    }

    if (!isRecord(body)) {
      return;
    }

    const locale = resolveRequestLocale(ctx.req.raw);
    const localized = localizeEnvelope(body, locale);
    const legacy =
      localized === null && response.status >= 400 && response.status !== 207
        ? localizeLegacy(body, locale, response.status)
        : null;
    const nextBody = localized ?? legacy;

    if (nextBody === null) {
      return;
    }

    const headers = new Headers(response.headers);
    headers.delete("content-length");

    const vary = headers.get("vary");
    const localeVary = "Accept-Language, X-Locale";
    const combinedVary = vary === null ? localeVary : `${vary}, ${localeVary}`;

    headers.set("vary", combinedVary);
    // Hono's `ctx.res` setter merges the previous headers over the new response,
    // so update the original response too or the new Vary value is overwritten.
    response.headers.set("vary", combinedVary);

    ctx.res = Response.json(nextBody, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}
