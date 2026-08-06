/** Identity and access primitives — `docs/domain-model.md` §1 and D1. */

export const UserRole = {
  RIDER: 'RIDER',
  DRIVER: 'DRIVER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const DriverApplicationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type DriverApplicationStatus =
  (typeof DriverApplicationStatus)[keyof typeof DriverApplicationStatus];

/** Does this user hold the given role? Roles are additive (decision D1). */
export function hasRole(roles: readonly UserRole[], role: UserRole): boolean {
  return roles.includes(role);
}

/**
 * Does this user hold at least one of the given roles?
 *
 * Authorization is role-*containment*, never role-*ranking*: an admin is not
 * implicitly a driver. A hierarchy would let an admin accept rides, which is
 * not a capability we ever intend to grant.
 */
export function hasAnyRole(
  roles: readonly UserRole[],
  allowed: readonly UserRole[],
): boolean {
  return allowed.some((role) => roles.includes(role));
}
