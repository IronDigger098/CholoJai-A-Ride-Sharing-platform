import { UserRole } from '@cholojai/shared';
import { beforeEach, expect, it } from '@jest/globals';

import {
  describeWithDatabase,
  useTestDatabase,
} from '../../testing/integration-database';

import { PrismaUserRepository } from './prisma-user.repository';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$salt$hash';

describeWithDatabase('PrismaUserRepository (real database)', () => {
  const database = useTestDatabase();
  let repository: PrismaUserRepository;

  beforeEach(() => {
    repository = new PrismaUserRepository(database());
  });

  async function createRider(email = 'rider@cholojai.test'): Promise<string> {
    const user = await repository.create({
      email,
      passwordHash: HASH,
      fullName: 'Test Rider',
      roles: [UserRole.RIDER],
    });

    return user.id;
  }

  describe('create', () => {
    it('writes the user and its role grants together', async () => {
      /* One transaction, deliberately. A user row without its RIDER grant
         is an account that exists, can sign in, and is invisible to every
         role check while still holding its email address. */
      const user = await repository.create({
        email: 'rider@cholojai.test',
        passwordHash: HASH,
        fullName: 'Nabila Rahman',
        roles: [UserRole.RIDER],
      });

      expect(user.roles).toEqual([UserRole.RIDER]);
      expect(
        await database().roleGrant.count({ where: { userId: user.id } }),
      ).toBe(1);
    });

    it('rejects a duplicate email', async () => {
      // The database index is the actual guarantee; the service's check
      // exists only to produce a friendly message before reaching it.
      await createRider();

      await expect(createRider()).rejects.toThrow();
    });

    it('rejects a duplicate phone number', async () => {
      await repository.create({
        email: 'one@cholojai.test',
        passwordHash: HASH,
        fullName: 'One',
        phone: '+8801711000001',
        roles: [UserRole.RIDER],
      });

      await expect(
        repository.create({
          email: 'two@cholojai.test',
          passwordHash: HASH,
          fullName: 'Two',
          phone: '+8801711000001',
          roles: [UserRole.RIDER],
        }),
      ).rejects.toThrow();
    });
  });

  describe('soft delete', () => {
    it('hides a deactivated account from findByEmail', async () => {
      const id = await createRider();
      await database().user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      expect(await repository.findByEmail('rider@cholojai.test')).toBeNull();
      expect(await repository.findById(id)).toBeNull();
    });

    it('still reports the address as taken', async () => {
      /* The deliberate asymmetry. The unique index ignores `deletedAt`, so
         a deactivated account keeps its address — and registration must see
         that, or it passes its own check and then dies on the constraint,
         turning a clear 409 into a 500. */
      const id = await createRider();
      await database().user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      expect(await repository.existsByEmail('rider@cholojai.test')).toBe(true);
    });
  });

  describe('role grants', () => {
    it('grants a role', async () => {
      const id = await createRider();

      const user = await repository.grantRole(id, UserRole.DRIVER);

      expect(user?.roles).toContain(UserRole.DRIVER);
    });

    it('is idempotent', async () => {
      const id = await createRider();

      await repository.grantRole(id, UserRole.DRIVER);
      const user = await repository.grantRole(id, UserRole.DRIVER);

      expect(user?.roles).toHaveLength(2);
    });

    it('survives two administrators granting at the same moment', async () => {
      /* The reason `grantRole` upserts rather than reading and inserting.
         Two concurrent grants both see "not granted yet"; a plain insert
         would make the second a constraint violation surfacing as a 500 for
         a request that wanted something already true. */
      const id = await createRider();

      const results = await Promise.all([
        repository.grantRole(id, UserRole.DRIVER),
        repository.grantRole(id, UserRole.DRIVER),
      ]);

      expect(results.every((user) => user !== null)).toBe(true);
      expect(
        await database().roleGrant.count({
          where: { userId: id, role: UserRole.DRIVER },
        }),
      ).toBe(1);
    });

    it('revokes a role, idempotently', async () => {
      const id = await createRider();
      await repository.grantRole(id, UserRole.DRIVER);

      await repository.revokeRole(id, UserRole.DRIVER);
      const user = await repository.revokeRole(id, UserRole.DRIVER);

      expect(user?.roles).toEqual([UserRole.RIDER]);
    });

    it('returns null for a user who does not exist', async () => {
      expect(await repository.grantRole('nobody', UserRole.DRIVER)).toBeNull();
      expect(await repository.revokeRole('nobody', UserRole.DRIVER)).toBeNull();
    });

    it('will not grant a role to a deactivated account', async () => {
      const id = await createRider();
      await database().user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      expect(await repository.grantRole(id, UserRole.DRIVER)).toBeNull();
    });
  });

  describe('updates', () => {
    it('replaces the password hash', async () => {
      const id = await createRider();

      await repository.updatePasswordHash(id, 'a-different-hash');

      expect((await repository.findById(id))?.passwordHash).toBe(
        'a-different-hash',
      );
    });

    it('marks the address verified', async () => {
      const id = await createRider();

      await repository.markEmailVerified(id);

      expect((await repository.findById(id))?.emailVerifiedAt).not.toBeNull();
    });
  });
});
