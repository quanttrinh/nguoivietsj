// @boundary shared
import { defaultStatements } from "better-auth/plugins/admin/access";

import { defineBasePermissions } from "~/auth/feature-permissions";

/**
 * User-management permissions.
 *
 * Better Auth owns the `user` and `session` resources, so this feature reuses
 * the default statement and only declares which actions the admin role gets.
 * Ban and phone-number actions are intentionally not granted.
 */
export const usersPermissions = defineBasePermissions({
  statement: defaultStatements,
  roles: {
    admin: {
      user: ["create", "list", "set-role", "delete", "set-password", "set-email", "get", "update"],
      session: ["list", "revoke", "delete"],
    },
  },
});
