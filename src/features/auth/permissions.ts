// @boundary shared
import { createAccessControl, type RoleAuthorizeRequest } from "better-auth/plugins/access";

import { eventsPermissions } from "~/features/auth/access/events";
import { usersPermissions } from "~/features/auth/access/users";
import { USER_ROLE } from "~/features/auth/roles";

/** Single access-control statement merged from every feature. */
export const statement = {
  ...usersPermissions.statement,
  ...eventsPermissions.statement,
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  [USER_ROLE.user]: ac.newRole({}),
  [USER_ROLE.admin]: ac.newRole({
    ...usersPermissions.roles.admin,
    ...eventsPermissions.roles.admin,
  }),
  [USER_ROLE.event_staff]: ac.newRole({ ...eventsPermissions.roles.event_staff }),
  [USER_ROLE.event_checkin]: ac.newRole({ ...eventsPermissions.roles.event_checkin }),
} as const;

export type RoleName = keyof typeof roles;
export type PermissionRequest = RoleAuthorizeRequest<typeof statement>;

function isRoleName(value: string): value is RoleName {
  return Object.hasOwn(roles, value);
}

/** Check a permission request against a possibly comma-separated role value. */
export function can(role: string | null | undefined, permissions: PermissionRequest): boolean {
  if (role === null || role === undefined || role.length === 0) {
    return false;
  }

  return role.split(",").some((part) => {
    const name = part.trim();

    return isRoleName(name) && roles[name].authorize(permissions).success;
  });
}
