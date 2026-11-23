// @boundary server
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

import { normalizeEmail } from "~/events/domain/normalize";
import { rateLimited } from "~/server/common-responses";
import { serverLogger } from "~/shared/server/logger";
import { isRecord } from "~/shared/utils/records";

const DEFAULT_RETRY_AFTER_SECONDS = 60;

export interface RateLimitSettings {
  /** Resolve the Cloudflare binding for the route. */
  limiter: (env: Env) => RateLimit | undefined;
  /** Namespaces keys so one policy cannot consume another policy's budget. */
  scope: string;
  /** Return null to skip the check for this request. */
  key: (request: Request) => string | null | Promise<string | null>;
  label?: string;
  retryAfterSeconds?: number;
  /**
   * Behavior when the binding is missing or throws.
   * Registration and OTP recovery default to "allow" so a limiter outage does
   * not take the endpoint offline; Turnstile/cooldowns still provide cover.
   */
  onUnavailable?: "allow" | "deny";
}

export type RateLimitCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: "limited" | "unavailable";
      retryAfterSeconds: number;
    };

function clientAddress(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();

  if (cfIp !== undefined && cfIp.length > 0) {
    return cfIp;
  }

  // Behind Cloudflare `cf-connecting-ip` is always present. Accept the
  // forwarded header only in local development so a spoofed value cannot pick
  // its own rate-limit bucket in production.
  if (import.meta.env.DEV) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();

    if (forwarded !== undefined && forwarded.length > 0) {
      return forwarded;
    }
  }

  return "unknown";
}

/** Build an IP-scoped key for the current request. */
export function clientKey(scope: string, request: Request): string {
  return `${scope}:${clientAddress(request)}`;
}

/** Build a normalized-email key, or null when there is no usable email. */
export function emailKey(scope: string, email: string): string | null {
  const normalized = normalizeEmail(email);

  return normalized.length === 0 ? null : `${scope}:${normalized}`;
}

/** Build an IP-and-identifier key for checks scoped to one record. */
export function clientIdKey(scope: string, request: Request, id: string | null): string {
  return `${scope}:${(id ?? "unknown").slice(0, 64)}:${clientAddress(request)}`;
}

/**
 * Run one rate-limit check with route-provided settings.
 *
 * Returns a structured result so callers can either render a custom response
 * or use `rateLimit()` middleware for the standard 429 response.
 */
export async function checkRateLimit(
  request: Request,
  env: Env,
  settings: RateLimitSettings,
): Promise<RateLimitCheck> {
  const retryAfterSeconds = settings.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
  const key = await settings.key(request);

  if (key === null || key.length === 0) {
    return { allowed: true };
  }

  const limiter = settings.limiter(env);

  if (limiter === undefined) {
    serverLogger.error(
      `${settings.label ?? settings.scope} rate limiter binding is not configured`,
    );
    return settings.onUnavailable === "deny"
      ? { allowed: false, reason: "unavailable", retryAfterSeconds }
      : { allowed: true };
  }

  try {
    const outcome = await limiter.limit({ key });
    return outcome.success
      ? { allowed: true }
      : { allowed: false, reason: "limited", retryAfterSeconds };
  } catch (error) {
    serverLogger.error(error, `${settings.label ?? settings.scope} rate limiter failed`);
    return settings.onUnavailable === "deny"
      ? { allowed: false, reason: "unavailable", retryAfterSeconds }
      : { allowed: true };
  }
}

/**
 * Hono middleware for the standard 429 response.
 *
 * Pass more than one setting to check independent keys, such as an IP key and
 * an identifier key. Each key gets its own counter.
 */
export function rateLimit(...settings: readonly RateLimitSettings[]): MiddlewareHandler<HonoEnv> {
  return createMiddleware<HonoEnv>(async (ctx, next) => {
    for (const setting of settings) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a blocked first key must short-circuit the rest.
      const result = await checkRateLimit(ctx.req.raw, ctx.env, setting);

      if (!result.allowed) {
        return rateLimited(ctx, result.retryAfterSeconds);
      }
    }

    return next();
  });
}

/**
 * Read a normalized email key from a JSON body without consuming the request.
 *
 * Returns null when the body is not JSON or has no usable email.
 */
export async function bodyEmailKey(scope: string, request: Request): Promise<string | null> {
  let body: unknown;

  try {
    body = await request.clone().json();
  } catch {
    return null;
  }

  if (!isRecord(body) || typeof body.email !== "string") {
    return null;
  }

  return emailKey(scope, body.email);
}
