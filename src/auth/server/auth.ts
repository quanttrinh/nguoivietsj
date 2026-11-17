// @boundary server
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import type { SecondaryStorage } from "better-auth/db";
import { drizzle } from "drizzle-orm/d1";

import { BETTER_AUTH_BASE_PATH } from "~/auth/constants";
import { authPlugins, baseAuthConfig } from "~/auth/server/config";
import { enqueueTwoFactorCodeEmail } from "~/auth/server/email/two-factor";
import {
  account,
  authRelations,
  rateLimit,
  session,
  twoFactor,
  user,
  verification,
} from "~/db/app/schemas/auth-schema";
import { drizzleLogger } from "~/db/logger";

const authSchema = { account, rateLimit, session, twoFactor, user, verification };

const authInstances = new WeakMap<Env, ReturnType<typeof createAuth>>();

// oxlint-disable-next-line typescript/explicit-function-return-type -- infer the concrete Better Auth instance.
function createAuth(env: Env) {
  const db = drizzle(env.APP_DB, { relations: authRelations, logger: drizzleLogger });
  const authKV = env.AUTH_SESSION_KV;

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

    plugins: authPlugins(async ({ user: recipient, otp }) => {
      const queued = await enqueueTwoFactorCodeEmail(env, {
        email: recipient.email,
        code: otp,
        // Better Auth's default OTP period.
        expiresMinutes: 3,
      });

      if (!queued) {
        throw new Error("Two-factor email could not be queued");
      }
    }),

    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
    }),

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Better Auth requires the full interface.
    ...(kvStorage ? { secondaryStorage: kvStorage as SecondaryStorage } : {}),

    secret: env.BETTER_AUTH_SECRET,
    baseURL: __BETTER_AUTH_BASE_URL__,
    basePath: BETTER_AUTH_BASE_PATH,

    trustedOrigins: [__BETTER_AUTH_BASE_URL__],
  });
}

/** Return the per-isolate Better Auth instance for this environment. */
export function auth(env: Env): ReturnType<typeof createAuth> {
  const existing = authInstances.get(env);

  if (existing !== undefined) {
    return existing;
  }

  const instance = createAuth(env);
  authInstances.set(env, instance);

  return instance;
}
