// @boundary server
import type { BetterAuthOptions } from "better-auth";
import { admin, twoFactor } from "better-auth/plugins";
import type { OTPOptions } from "better-auth/plugins/two-factor";

import { ac, roles } from "~/auth/permissions";
import { USER_ROLE } from "~/auth/roles";

/**
 * Better Auth plugins. `sendOTP` needs Worker bindings, so `src/auth/server/auth.ts`
 * supplies it at runtime; the CLI only needs the schema.
 */
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
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },

  session: {
    // KV is the session store; session checks should not read or write D1.
    storeSessionInDatabase: false,
  },

  verification: {
    // KV cannot atomically consume one-time values; keep them in D1.
    storeInDatabase: true,
  },

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
        type: Object.values(USER_ROLE),
        required: false,
        input: false,
        defaultValue: USER_ROLE.user,
      },
      twoFactorRequired: {
        type: "boolean",
        required: true,
        input: false,
        defaultValue: true,
      },
    },
  },

  plugins: authPlugins(),
} satisfies BetterAuthOptions;
