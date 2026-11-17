// @boundary shared
import type { Statements } from "better-auth/plugins/access";

import type { UserRole } from "~/auth/roles";

type RoleGrantFor<TStatement extends Statements> = {
  [TResource in keyof TStatement]?: readonly TStatement[TResource][number][];
};

/** Reject any resource key that does not start with the feature prefix. */
type PrefixedStatement<TStatement extends Statements, TPrefix extends string> = {
  [TResource in keyof TStatement]: TResource extends `${TPrefix}${string}`
    ? TStatement[TResource]
    : never;
};

export interface FeaturePermissions<
  TStatement extends Statements,
  TPrefix extends string = string,
> {
  statement: TStatement & PrefixedStatement<TStatement, TPrefix>;
  roles: Partial<Record<UserRole, RoleGrantFor<TStatement>>>;
}

/**
 * Define permissions for a namespaced feature.
 *
 * Every resource key must start with the supplied prefix, so a feature cannot
 * override core resources such as `user` or `session`, or collide with another
 * feature namespace.
 */
export function defineFeaturePermissions<const TPrefix extends string>(_prefix: TPrefix) {
  return <const TStatement extends Statements>(
    feature: FeaturePermissions<TStatement, TPrefix>,
  ): FeaturePermissions<TStatement, TPrefix> => feature;
}

/** Define core permissions that are allowed to own the reserved resources. */
export function defineBasePermissions<const TStatement extends Statements>(
  feature: FeaturePermissions<TStatement>,
): FeaturePermissions<TStatement> {
  return feature;
}
