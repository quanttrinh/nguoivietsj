// @boundary server
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { type SecondaryStorage } from "better-auth/db";
import { drizzle } from "drizzle-orm/d1";

import {
  account,
  authRelations,
  rateLimit,
  session,
  user,
  verification,
} from "~/db/app/schemas/auth-schema";
import { drizzleLogger } from "~/db/logger";
import { baseAuthConfig } from "~/server/auth/config";
import { BETTER_AUTH_BASE_PATH } from "~/shared/constants/auth";

const authSchema = { account, rateLimit, session, user, verification };

// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- infer the concrete Better Auth instance.
export function auth(env: Env) {
  const db = drizzle(env.APP_DB, { relations: authRelations, logger: drizzleLogger });
  const authKV = env.AUTH_SESSION_KV;
  // Injected from the active Wrangler custom-domain route by the
  // `better-auth-url` Astro integration. The fallback only applies outside
  // Vite bundles, such as the Better Auth CLI.
  const baseURL = __BETTER_AUTH_BASE_URL__ ?? "http://localhost:4321";

  // Keep the optional guard for older deployments that predate the KV binding.
  // oxlint-disable-next-line typescript/no-unnecessary-condition, typescript/strict-boolean-expressions -- Env types cannot express an older deployment without the binding.
  const kvStorage: Pick<SecondaryStorage, "get" | "set" | "delete"> | undefined = authKV
    ? {
        get: (key: string) => authKV.get(key),
        set: async (key: string, value: string, ttl?: number) => {
          if (ttl === undefined) {
            await authKV.put(key, value);
            return;
          }

          // Cloudflare KV requires expirationTtl >= 60 seconds.
          const expirationTtl = Math.max(60, ttl);
          await authKV.put(key, value, { expirationTtl });
        },
        delete: async (key: string) => {
          await authKV.delete(key);
        },
      }
    : undefined;

  return betterAuth({
    ...baseAuthConfig,

    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
    }),

    // Better Auth 1.7 requires atomic getAndDelete/increment for verification
    // and rate limiting. KV provides neither, so those use D1; KV only stores
    // sessions via get/set/delete.
    // KV implements only the session store surface; verification and rate limits use D1.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Better Auth requires the full interface.
    ...(kvStorage ? { secondaryStorage: kvStorage as SecondaryStorage } : {}),

    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    basePath: BETTER_AUTH_BASE_PATH,

    trustedOrigins: [baseURL],
  });
}
