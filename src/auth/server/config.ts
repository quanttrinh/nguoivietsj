// @boundary server
import type { BetterAuthOptions } from "better-auth";
import { admin, twoFactor } from "better-auth/plugins";
import type { OTPOptions } from "better-auth/plugins/two-factor";

import { ac, roles } from "~/auth/permissions";
import { USER_ROLE } from "~/auth/roles";
import { hashPassword, verifyPassword } from "~/auth/server/password";

/** Roles that must enroll in two-factor authentication before using the API. */
export const TWO_FACTOR_ROLES: ReadonlySet<string> = new Set([
  USER_ROLE.admin,
  USER_ROLE.event_staff,
  USER_ROLE.event_checkin,
]);

/**
 * Better Auth plugins. `sendOTP` needs Worker bindings, so `src/auth/server/auth.ts`
 * supplies it at runtime; the CLI only needs the schema.
 */
// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types -- infer the concrete plugin tuple.
export function authPlugins(sendOTP?: OTPOptions["sendOTP"]) {
  const adminPlugin = admin({
    ac,
    defaultRole: USER_ROLE.user,
    adminRoles: [USER_ROLE.admin],
    roles,
  });
  const twoFactorPlugin = twoFactor({
    issuer: "Người Việt SJ",
    otpOptions: {
      sendOTP,
      // Only a hash of the emailed code is stored in D1.
      storeOTP: "hashed",
    },
    backupCodeOptions: { storeBackupCodes: "encrypted" },
  });
  // A mutable tuple keeps each plugin's inferred API and session fields.
  const plugins: [typeof adminPlugin, typeof twoFactorPlugin] = [adminPlugin, twoFactorPlugin];

  return plugins;
}

/**
 * Environment-independent Better Auth configuration.
 *
 * Runtime bindings, secrets, and the database adapter are added in
 * `src/auth/server/auth.ts`. Keeping this object env-free lets the Better Auth CLI
 * reuse the same plugins and role definitions when generating the schema.
 */
export const baseAuthConfig = {
  emailAndPassword: {
    enabled: true,
    // Accounts are provisioned by staff; public sign-up must stay closed.
    disableSignUp: true,
    // WebCrypto PBKDF2 keeps hashing inside the Workers Free 10 ms CPU budget.
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
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

  // Auth rate limits live in the Workers rate-limiting bindings used from
  // src/server/root.ts. Better Auth's D1 counter added two cross-region round
  // trips per request, so its limiter stays off.
  rateLimit: {
    enabled: false,
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

  plugins: authPlugins(),
} satisfies BetterAuthOptions;
