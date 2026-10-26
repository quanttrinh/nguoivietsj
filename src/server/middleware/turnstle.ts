// @boundary server
import { type } from "arktype";
import { type Context, type MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

import { apiError } from "~/server/api-response";
import { internalServerError } from "~/server/common-responses";
import { serverLogger } from "~/shared/server/logger";
import { coalesceString } from "~/shared/utils/string";

const turnstileTokenSchema = type("0 < string <= 2048");

const siteverifyResponseSchema = type({
  success: "boolean",
  "challenge_ts?": "string",
  "hostname?": "string",
  "error-codes?": "string[]",
  "action?": "string",
  "cdata?": "string",
});
type SiteverifyResponse = typeof siteverifyResponseSchema.infer;

interface SiteverifyRequest {
  secret: string;
  response: string;
  remoteip?: string;
  idempotency_key?: string;
}

function resolveSecret(ctx: Context<HonoEnv>): string | null {
  const configured = coalesceString(ctx.env.TURNSTILE_SECRET);
  return configured.length > 0 ? configured : null;
}

async function verifyTurnstile(
  ctx: Context<HonoEnv>,
  request: SiteverifyRequest,
): Promise<SiteverifyResponse> {
  const response = await fetch(coalesceString(ctx.env.TURNSTILE_SITEVERIFY_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Turnstile siteverify request failed with status ${response.status}`);
  }

  const json: unknown = await response.json();

  return siteverifyResponseSchema.assert(json);
}

function challengeRequired(ctx: Context<HonoEnv>): Response {
  return apiError(ctx, "turnstile_required", { status: 403 });
}

export function requireTurnstile(expectedAction?: string): MiddlewareHandler<HonoEnv> {
  return createMiddleware<HonoEnv>(async (ctx, next) => {
    const token = turnstileTokenSchema(ctx.req.header("X-Turnstile-Token"));

    if (token instanceof type.errors) {
      return challengeRequired(ctx);
    }

    const secret = resolveSecret(ctx);

    if (secret == null) {
      serverLogger.error("Turnstile secret is not configured");
      return internalServerError(ctx);
    }

    let result: Awaited<ReturnType<typeof verifyTurnstile>>;

    try {
      const remoteip = ctx.req.header("CF-Connecting-IP");
      result = await verifyTurnstile(ctx, {
        secret,
        response: token,
        ...(remoteip ? { remoteip } : {}),
      });
    } catch (error) {
      serverLogger.error(error);
      return apiError(ctx, "turnstile_verification_failed", { status: 500 });
    }

    if (!result.success) {
      return challengeRequired(ctx);
    }

    const allowTestKey = coalesceString(ctx.env.TURNSTILE_ALLOW_TEST_KEY) === "true";
    if (expectedAction !== undefined && !allowTestKey && result.action !== expectedAction) {
      return apiError(ctx, "turnstile_failed", { status: 403 });
    }

    return next();
  });
}
