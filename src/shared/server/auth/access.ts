import { DEV_STAFF_EMAIL } from "astro:env/server";
import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { createUserRepository, type UserIdentity } from "~/db/app/users";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function configuredTeamDomain(): string | null {
  const value = (env.CF_ACCESS_TEAM_DOMAIN ?? "").trim();

  if (value.length === 0) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function configuredAudience(): string | null {
  const value = (env.CF_ACCESS_AUD ?? "").trim();

  return value.length > 0 ? value : null;
}

/** True when Access JWT enforcement is configured for this Worker. */
export function isAccessConfigured(): boolean {
  return (
    (env.CF_ACCESS_TEAM_DOMAIN ?? "").trim().length > 0 ||
    (env.CF_ACCESS_AUD ?? "").trim().length > 0
  );
}

/**
 * Resolve a development identity without requiring Cloudflare Access.
 *
 * This is compiled behind `import.meta.env.DEV`, so it cannot become a
 * production authentication path.
 */
export function findDevStaff(): Promise<UserIdentity | null> {
  if (!import.meta.env.DEV) {
    return Promise.resolve(null);
  }

  const email = (DEV_STAFF_EMAIL ?? "").trim().toLowerCase();

  if (email.length === 0) {
    return Promise.resolve(null);
  }

  return createUserRepository(env.APP_DB).findIdentityByEmail(email);
}

/**
 * Resolve the authenticated Access identity to a local user.
 *
 * Returns null for missing, invalid, expired, or non-identity tokens. Callers
 * must treat null as forbidden.
 */
export async function findAccessUser(request: Request): Promise<UserIdentity | null> {
  const teamDomain = configuredTeamDomain();
  const audience = configuredAudience();

  if (teamDomain === null || audience === null) {
    if (isAccessConfigured()) {
      console.error("Cloudflare Access is partially configured; check team domain and AUD.");
    }

    return null;
  }

  const token = request.headers.get("cf-access-jwt-assertion");

  if (token === null || token.length === 0) {
    return null;
  }

  let jwks = jwksCache.get(teamDomain);

  if (jwks === undefined) {
    jwks = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain));
    jwksCache.set(teamDomain, jwks);
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: teamDomain,
      audience,
      algorithms: ["RS256"],
    });

    if (payload.type !== "app" || typeof payload.email !== "string") {
      return null;
    }

    const email = payload.email.trim().toLowerCase();

    if (email.length === 0) {
      return null;
    }

    return await createUserRepository(env.APP_DB).findIdentityByEmail(email);
  } catch (error) {
    console.warn(
      "Cloudflare Access JWT rejected",
      error instanceof Error ? error.message : "invalid token",
    );
    return null;
  }
}

/** Resolve the current request user through Access, then the dev fallback. */
export async function resolveRequestUser(request: Request): Promise<UserIdentity | null> {
  const accessUser = await findAccessUser(request);

  if (accessUser !== null) {
    return accessUser;
  }

  return findDevStaff();
}
