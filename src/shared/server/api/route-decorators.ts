import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { APIContext, APIRoute } from "astro";

import { MAX_ENGINE_BODY_BYTES } from "~/events/domain/limits";
import { invalidFields } from "~/events/domain/validation";
import { readJsonObject } from "~/shared/server/api/body";
import { isSameOriginRequest } from "~/shared/server/api/origin";
import { forbidden, invalidPayload } from "~/shared/server/api/responses";
import { isAccessConfigured, resolveRequestUser } from "~/shared/server/auth/access";
import { hasAdminAccess, hasEngineAccess } from "~/shared/server/auth/roles";

function stateChanging(request: Request): boolean {
  return !["GET", "HEAD"].includes(request.method);
}

async function requireUser(
  context: APIContext,
  allowed: (
    user: Awaited<ReturnType<typeof resolveRequestUser>>,
  ) => user is Awaited<ReturnType<typeof resolveRequestUser>>,
): Promise<Response | null> {
  const user = await resolveRequestUser(context.request);

  if (!allowed(user)) {
    if (!isAccessConfigured() && !import.meta.env.DEV) {
      console.error("Staff access requires CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD.");
    }

    return forbidden();
  }

  context.locals.user = user;
  return null;
}

/** Protect an API route with Cloudflare Access and the admin role. */
export function withAdminRoute(handler: APIRoute): APIRoute {
  return async function adminRoute(context) {
    const denied = await requireUser(context, hasAdminAccess);

    if (denied !== null) {
      return denied;
    }

    if (stateChanging(context.request) && !isSameOriginRequest(context.request)) {
      return forbidden();
    }

    return handler(context);
  };
}

/** Protect an API route with Cloudflare Access and either staff or admin. */
export function withStaffRoute(handler: APIRoute): APIRoute {
  return async function staffRoute(context) {
    const denied = await requireUser(context, hasEngineAccess);

    if (denied !== null) {
      return denied;
    }

    if (stateChanging(context.request) && !isSameOriginRequest(context.request)) {
      return forbidden();
    }

    return handler(context);
  };
}

/** Require a same-origin request for a public API route. */
export function withSameOriginRoute(handler: APIRoute): APIRoute {
  return (context) => {
    if (!isSameOriginRequest(context.request)) {
      return forbidden();
    }

    return handler(context);
  };
}

type ValidatedBody<T> = { ok: true; body: T } | { ok: false; response: Response };

/** Read and validate a JSON API body without returning HTTP responses as values. */
async function readValidatedBody<T extends TSchema>(
  request: Request,
  schema: T,
): Promise<ValidatedBody<Static<T>>> {
  const payload = await readJsonObject(request, MAX_ENGINE_BODY_BYTES);

  if (payload instanceof Response) {
    return { ok: false, response: payload };
  }

  if (!Value.Check(schema, payload)) {
    return {
      ok: false,
      response: invalidPayload(
        invalidFields([...Value.Errors(schema, payload)].map((error) => error.path)),
      ),
    };
  }

  return { ok: true, body: payload };
}

/**
 * Read and validate a JSON body, then call the route handler with the typed
 * body. Invalid bodies short-circuit with the same response as before.
 *
 * `beforeBody` runs before the body is read, so request guards keep their
 * original ordering relative to body parsing and body-size limits.
 */
export function withValidatedBody<T extends TSchema>(
  schema: T,
  handler: (context: APIContext, body: Static<T>) => Response | Promise<Response>,
  beforeBody?: (context: APIContext) => Response | null | Promise<Response | null>,
): APIRoute {
  return async (context) => {
    const early = beforeBody === undefined ? null : await beforeBody(context);

    if (early !== null) {
      return early;
    }

    const result = await readValidatedBody(context.request, schema);

    return result.ok ? handler(context, result.body) : result.response;
  };
}
