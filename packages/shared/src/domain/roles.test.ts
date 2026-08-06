import { describe, expect, it } from '@jest/globals';

import { hasAnyRole, hasRole, UserRole } from './roles';

describe('roles', () => {
  it('detects a held role', () => {
    expect(hasRole([UserRole.RIDER], UserRole.RIDER)).toBe(true);
    expect(hasRole([UserRole.RIDER], UserRole.DRIVER)).toBe(false);
  });

  it('supports a user holding several roles (decision D1)', () => {
    const roles = [UserRole.RIDER, UserRole.DRIVER];
    expect(hasRole(roles, UserRole.RIDER)).toBe(true);
    expect(hasRole(roles, UserRole.DRIVER)).toBe(true);
  });

  it('matches any of several allowed roles', () => {
    expect(
      hasAnyRole([UserRole.DRIVER], [UserRole.ADMIN, UserRole.DRIVER]),
    ).toBe(true);
    expect(
      hasAnyRole([UserRole.RIDER], [UserRole.ADMIN, UserRole.DRIVER]),
    ).toBe(false);
  });

  it('does not treat ADMIN as a superset of other roles', () => {
    // Authorization is containment, not ranking: an admin must not be able
    // to accept rides simply by being an admin.
    expect(hasRole([UserRole.ADMIN], UserRole.DRIVER)).toBe(false);
  });

  it('returns false for a user with no roles', () => {
    expect(hasRole([], UserRole.RIDER)).toBe(false);
    expect(hasAnyRole([], [UserRole.RIDER, UserRole.ADMIN])).toBe(false);
  });
});
