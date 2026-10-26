import type { UserIdentity } from "~/db/app/users";
import { USER_ROLE } from "~/shared/constants/roles";

const ENGINE_ROLES: ReadonlySet<UserIdentity["role"]> = new Set([USER_ROLE.admin, USER_ROLE.staff]);

/** True when the authenticated user may access the event-engine staff area. */
export function hasEngineAccess(user: UserIdentity | null): user is UserIdentity {
  return user !== null && ENGINE_ROLES.has(user.role);
}

/** True when the authenticated user may manage events and their configuration. */
export function hasAdminAccess(user: UserIdentity | null): user is UserIdentity {
  return user !== null && user.role === USER_ROLE.admin;
}
