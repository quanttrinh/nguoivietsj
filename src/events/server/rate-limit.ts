import { env } from "cloudflare:workers";

import { REGISTRATION_ERROR } from "~/events/domain/form-schema/constants";

export const REGISTRATION_RATE_LIMIT_PERIOD_SECONDS = 60;
export const STATUS_OTP_RATE_LIMIT_PERIOD_SECONDS = 60;

function clientAddress(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();

  if (cfIp !== undefined && cfIp.length > 0) {
    return cfIp;
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();

  if (forwarded !== undefined && forwarded.length > 0) {
    return forwarded;
  }

  return "unknown";
}

function clientKey(request: Request, scope: string): string {
  return `${scope}:${clientAddress(request)}`;
}

/**
 * Apply the Cloudflare per-IP registration limiter before any D1 work.
 *
 * The limiter is a defense-in-depth layer behind Turnstile. If the binding is
 * unavailable, log the problem and let Turnstile protect the request rather
 * than taking registration offline.
 */
export async function enforceRegistrationRateLimit(request: Request): Promise<Response | null> {
  const limiter = env.EVENT_ENGINE_REGISTRATION_RATE_LIMITER;

  if (limiter === undefined) {
    console.error("Registration rate limiter binding is not configured");
    return null;
  }

  try {
    const outcome = await limiter.limit({ key: clientKey(request, "registration") });

    if (outcome.success) {
      return null;
    }

    return Response.json(
      { error: REGISTRATION_ERROR.rateLimited },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(REGISTRATION_RATE_LIMIT_PERIOD_SECONDS),
        },
      },
    );
  } catch (error) {
    console.error("Registration rate limiter failed", error);
    return null;
  }
}

/**
 * Limit status-page OTP requests per IP before any D1 lookup or email enqueue.
 *
 * Returns true when the request is allowed. Missing or failing bindings are
 * treated as permissive so OTP recovery does not become unavailable.
 */
export async function allowStatusOtpRequest(request: Request): Promise<boolean> {
  const limiter = env.EVENT_ENGINE_STATUS_RATE_LIMITER;

  if (limiter === undefined) {
    console.error("Status OTP rate limiter binding is not configured");
    return true;
  }

  try {
    const outcome = await limiter.limit({ key: clientKey(request, "status-otp") });
    return outcome.success;
  } catch (error) {
    console.error("Status OTP rate limiter failed", error);
    return true;
  }
}
