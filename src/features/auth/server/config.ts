// @boundary server
import type { BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";
import { emailOTP, type EmailOTPOptions } from "better-auth/plugins/email-otp";

import { ac, roles } from "~/features/auth/permissions";
import { USER_ROLE } from "~/features/auth/roles";

/**
 * Better Auth plugins. `sendVerificationOTP` needs Worker bindings, so
 * `src/auth/server/auth.ts` supplies it at runtime; the CLI only needs the schema.
 */
export function authPlugins(
  sendVerificationOTP?: EmailOTPOptions["sendVerificationOTP"],
  generateOTP?: EmailOTPOptions["generateOTP"],
) {
  const adminPlugin = admin({
    ac,
    defaultRole: USER_ROLE.user,
    adminRoles: [USER_ROLE.admin],
    roles,
  });
  const emailOtpPlugin = emailOTP({
    sendVerificationOTP: sendVerificationOTP ?? (() => Promise.resolve()),
    storeOTP: "hashed",
    expiresIn: 10 * 60,
    disableSignUp: true,
    ...(generateOTP === undefined ? {} : { generateOTP }),
  });
  // A mutable tuple keeps each plugin's inferred API and session fields.
  const plugins: [typeof adminPlugin, typeof emailOtpPlugin] = [adminPlugin, emailOtpPlugin];

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
    },
  },

  plugins: authPlugins(),
} satisfies BetterAuthOptions;
