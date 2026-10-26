// @boundary server
import { admin } from "better-auth/plugins";

import { ac, roles } from "~/auth/permissions";
import { USER_ROLE } from "~/auth/roles";

/**
 * Environment-independent Better Auth configuration.
 *
 * Runtime bindings, secrets, and the database adapter are added in
 * `src/server/auth.ts`. Keeping this object env-free lets the Better Auth CLI
 * reuse the same plugins and role definitions when generating the schema.
 */
export const baseAuthConfig = {
  emailAndPassword: {
    enabled: true,
    // Accounts are provisioned by staff; public sign-up must stay closed.
    disableSignUp: true,
  },

  session: {
    // KV is the session store; session checks should not read or write D1.
    storeSessionInDatabase: false,
    cookieCache: {
      enabled: true,
      // 5 minutes: short-lived cookie cache.
      maxAge: 5 * 60,
      strategy: "compact" as const,
      // Session cache falls back to KV after expiry, so no stateless refresh.
      refreshCache: false,
    },
  },

  verification: {
    // KV cannot atomically consume one-time values; keep them in D1.
    storeInDatabase: true,
  },

  rateLimit: {
    // KV cannot atomically increment counters; keep auth limits in D1.
    storage: "database" as const,
  },

  advanced: {
    ipAddress: {
      // Cloudflare supplies the authoritative client address here.
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },

  user: {
    additionalFields: {
      role: {
        // The admin plugin owns the runtime role field; this declaration keeps
        // `user.role` typed on sessions and server API responses.
        type: Object.values(USER_ROLE),
        required: false,
        input: false,
        defaultValue: USER_ROLE.user,
      },
    },
  },

  plugins: [
    admin({
      ac,
      defaultRole: USER_ROLE.user,
      adminRoles: [USER_ROLE.admin],
      roles,
    }),
  ],
};
