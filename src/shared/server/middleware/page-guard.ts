import type { UserIdentity } from "~/db/app/users";
import { isAccessConfigured, resolveRequestUser } from "~/shared/server/auth/access";
import { hasAdminAccess, hasEngineAccess } from "~/shared/server/auth/roles";

interface AdminPageContext {
  request: Request;
  locals: App.Locals;
  response: {
    headers: Headers;
  };
}

function privateHeaders(headers: Headers): void {
  headers.set("cache-control", "no-store");

  const vary = headers.get("vary");

  if (vary === null) {
    headers.set("vary", "Cookie");
  } else if (!vary.split(",").some((value) => value.trim().toLowerCase() === "cookie")) {
    headers.set("vary", `${vary}, Cookie`);
  }
}

async function requirePageUser(
  context: AdminPageContext,
  allowed: (user: UserIdentity | null) => user is UserIdentity,
): Promise<UserIdentity | Response> {
  const user = await resolveRequestUser(context.request);

  if (!allowed(user)) {
    if (!isAccessConfigured() && !import.meta.env.DEV) {
      console.error("Staff access requires CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD.");
    }

    return new Response("Forbidden", {
      status: 403,
      headers: { "cache-control": "no-store", vary: "Cookie" },
    });
  }

  context.locals.user = user;
  privateHeaders(context.response.headers);
  return user;
}

/** Guard an Astro admin page with Cloudflare Access and the admin role. */
export function requireAdminPage(context: AdminPageContext): Promise<UserIdentity | Response> {
  return requirePageUser(context, hasAdminAccess);
}

/** Guard an Astro staff page with Cloudflare Access and either staff or admin. */
export function requireStaffPage(context: AdminPageContext): Promise<UserIdentity | Response> {
  return requirePageUser(context, hasEngineAccess);
}
