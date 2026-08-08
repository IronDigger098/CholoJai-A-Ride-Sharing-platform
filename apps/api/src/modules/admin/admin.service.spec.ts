import { UserRole } from '@cholojai/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { ResourceNotFoundError } from '../../common/errors/domain-error';
import { InMemoryUserRepository } from '../../testing/in-memory-user.repository';
import { type UserRecord } from '../users/user-repository.port';

import {
  CannotRevokeOwnAdminRoleError,
  CannotRevokeRiderRoleError,
} from './admin.errors';
import { AdminService } from './admin.service';

function makeUser(
  id: string,
  roles: UserRole[],
  email = `${id}@example.com`,
): UserRecord {
  return {
    id,
    email,
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
    fullName: 'Test Person',
    phone: null,
    avatarUrl: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-08-07T00:00:00.000Z'),
    roles,
  };
}

const ADMIN_A = 'admin_a';
const ADMIN_B = 'admin_b';
const RIDER = 'rider_1';

function makeService(): {
  service: AdminService;
  users: InMemoryUserRepository;
} {
  const users = new InMemoryUserRepository([
    makeUser(ADMIN_A, [UserRole.RIDER, UserRole.ADMIN]),
    makeUser(ADMIN_B, [UserRole.RIDER, UserRole.ADMIN]),
    makeUser(RIDER, [UserRole.RIDER]),
  ]);

  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  return { service: new AdminService(users), users };
}

describe('AdminService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('grantRole', () => {
    it('adds the role and returns the updated user', async () => {
      const { service } = makeService();

      const { user } = await service.grantRole(ADMIN_A, RIDER, UserRole.DRIVER);

      expect(user.roles).toEqual([UserRole.RIDER, UserRole.DRIVER]);
    });

    it('is idempotent', async () => {
      // An administrator clicking twice should not see a failure, and the
      // second grant must not duplicate the role.
      const { service } = makeService();

      await service.grantRole(ADMIN_A, RIDER, UserRole.DRIVER);
      const { user } = await service.grantRole(ADMIN_A, RIDER, UserRole.DRIVER);

      expect(user.roles).toEqual([UserRole.RIDER, UserRole.DRIVER]);
    });

    it('404s for an unknown user', async () => {
      const { service } = makeService();

      await expect(
        service.grantRole(ADMIN_A, 'nobody', UserRole.DRIVER),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('never returns the password hash', async () => {
      const { service } = makeService();

      const result = await service.grantRole(ADMIN_A, RIDER, UserRole.DRIVER);

      expect(JSON.stringify(result)).not.toContain('argon2');
    });
  });

  describe('revokeRole', () => {
    it('removes the role and returns the updated user', async () => {
      const { service } = makeService();
      await service.grantRole(ADMIN_A, RIDER, UserRole.DRIVER);

      const { user } = await service.revokeRole(
        ADMIN_A,
        RIDER,
        UserRole.DRIVER,
      );

      expect(user.roles).toEqual([UserRole.RIDER]);
    });

    it('is idempotent', async () => {
      const { service } = makeService();

      const { user } = await service.revokeRole(
        ADMIN_A,
        RIDER,
        UserRole.DRIVER,
      );

      expect(user.roles).toEqual([UserRole.RIDER]);
    });

    it('404s for an unknown user', async () => {
      const { service } = makeService();

      await expect(
        service.revokeRole(ADMIN_A, 'nobody', UserRole.DRIVER),
      ).rejects.toThrow(ResourceNotFoundError);
    });
  });

  describe('the invariants revocation protects', () => {
    it('refuses to remove RIDER', async () => {
      /* Every account is a rider. Removing it leaves an account that exists,
         can sign in, and can do nothing — invisible to every role check
         while still holding its email address. */
      const { service } = makeService();

      await expect(
        service.revokeRole(ADMIN_A, RIDER, UserRole.RIDER),
      ).rejects.toThrow(CannotRevokeRiderRoleError);
    });

    it('refuses to let an admin remove their own ADMIN role', async () => {
      const { service } = makeService();

      await expect(
        service.revokeRole(ADMIN_A, ADMIN_A, UserRole.ADMIN),
      ).rejects.toThrow(CannotRevokeOwnAdminRoleError);
    });

    it('lets one admin demote another', async () => {
      const { service } = makeService();

      const { user } = await service.revokeRole(
        ADMIN_A,
        ADMIN_B,
        UserRole.ADMIN,
      );

      expect(user.roles).toEqual([UserRole.RIDER]);
    });

    it('leaves at least one administrator no matter the order', async () => {
      /* The whole reason the self-revocation rule is sufficient, asserted
         rather than argued. Two admins: either may demote the other, and
         whoever is left cannot demote themselves. The count reaches one and
         stops — without a COUNT(*) query, and without the race two
         concurrent revocations would have if there were one. */
      const { service, users } = makeService();

      await service.revokeRole(ADMIN_B, ADMIN_A, UserRole.ADMIN);
      await expect(
        service.revokeRole(ADMIN_B, ADMIN_B, UserRole.ADMIN),
      ).rejects.toThrow(CannotRevokeOwnAdminRoleError);

      const remaining = users.rows.filter((row) =>
        row.roles.includes(UserRole.ADMIN),
      );
      expect(remaining).toHaveLength(1);
    });

    it('answers 409, because permission is not what is missing', async () => {
      const { service } = makeService();

      try {
        await service.revokeRole(ADMIN_A, ADMIN_A, UserRole.ADMIN);
        throw new Error('expected a rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(CannotRevokeOwnAdminRoleError);
        const conflict = error as CannotRevokeOwnAdminRoleError;
        expect(conflict.status).toBe(409);
        expect(conflict.code).toBe('CANNOT_REVOKE_OWN_ADMIN_ROLE');
      }
    });

    it('checks the invariants before touching the database', async () => {
      // A refused request must leave no trace. Validating after the write
      // would mean the RIDER role was briefly gone.
      const { service, users } = makeService();

      await service
        .revokeRole(ADMIN_A, RIDER, UserRole.RIDER)
        .catch(() => undefined);

      expect(users.rows.find((row) => row.id === RIDER)?.roles).toEqual([
        UserRole.RIDER,
      ]);
    });
  });
});
