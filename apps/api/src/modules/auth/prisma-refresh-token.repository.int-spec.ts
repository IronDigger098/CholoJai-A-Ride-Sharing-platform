import { randomUUID } from 'node:crypto';

import { UserRole } from '@cholojai/shared';
import { beforeEach, expect, it } from '@jest/globals';

import {
  describeWithDatabase,
  useTestDatabase,
} from '../../testing/integration-database';
import { PrismaUserRepository } from '../users/prisma-user.repository';

import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

describeWithDatabase('PrismaRefreshTokenRepository (real database)', () => {
  const database = useTestDatabase();
  let repository: PrismaRefreshTokenRepository;
  let userId: string;

  beforeEach(async () => {
    const prisma = database();
    repository = new PrismaRefreshTokenRepository(prisma);

    const user = await new PrismaUserRepository(prisma).create({
      email: 'rider@cholojai.test',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
      fullName: 'Test Rider',
      roles: [UserRole.RIDER],
    });

    userId = user.id;
  });

  /* `hash` is annotated rather than inferred: without it, the default
     narrows the parameter to `randomUUID()`'s template-literal type and
     every readable test value becomes a type error. */
  function tokenInput(
    familyId: string,
    hash: string = randomUUID(),
  ): Parameters<PrismaRefreshTokenRepository['create']>[0] {
    return {
      userId,
      tokenHash: hash,
      familyId,
      expiresAt: new Date(Date.now() + 7 * DAY_MS),
    };
  }

  it('round-trips a token by its hash', async () => {
    const created = await repository.create(tokenInput('fam-1', 'hash-1'));

    const found = await repository.findByHash('hash-1');

    expect(found?.id).toBe(created.id);
    expect(found?.familyId).toBe('fam-1');
    expect(found?.revokedAt).toBeNull();
  });

  it('returns null for a hash nobody has', async () => {
    expect(await repository.findByHash('nothing')).toBeNull();
  });

  it('rejects a duplicate token hash', async () => {
    /* The unique index is what makes "look the token up by its hash" a
       lookup rather than a search. Without it a hash collision — or a bug
       that reused a value — would silently return an arbitrary row. */
    await repository.create(tokenInput('fam-1', 'same-hash'));

    await expect(
      repository.create(tokenInput('fam-2', 'same-hash')),
    ).rejects.toThrow();
  });

  describe('rotate', () => {
    it('retires the current token and links it to its successor', async () => {
      const current = await repository.create(tokenInput('fam-1', 'first'));

      const successor = await repository.rotate({
        currentId: current.id,
        successor: tokenInput('fam-1', 'second'),
      });

      const retired = await repository.findByHash('first');

      expect(successor?.familyId).toBe('fam-1');
      expect(retired?.revokedAt).not.toBeNull();
      expect(retired?.replacedById).toBe(successor?.id);
    });

    it('refuses to rotate a token that is already revoked', async () => {
      const current = await repository.create(tokenInput('fam-1', 'first'));
      await repository.revokeFamily('fam-1');

      const result = await repository.rotate({
        currentId: current.id,
        successor: tokenInput('fam-1', 'second'),
      });

      expect(result).toBeNull();
    });

    it('produces exactly ONE successor from concurrent rotations', async () => {
      /* The assertion this whole integration suite exists for.
       *
       * The unit tests prove the *logic* of losing a race, but they run
       * against a fake that is atomic only because JavaScript is
       * single-threaded. The real guarantee is PostgreSQL taking a row lock
       * on the conditional UPDATE and re-evaluating `revoked_at IS NULL`
       * after acquiring it, so the loser matches zero rows.
       *
       * If that were ever wrong — a changed isolation level, a rewritten
       * query, an ORM upgrade that splits the statement — two live refresh
       * tokens would exist in one family. Reuse detection would then fire
       * on a legitimate user's own token and sign them out, or worse, stop
       * firing on a stolen one. */
      const current = await repository.create(tokenInput('fam-1', 'first'));

      const [a, b] = await Promise.all([
        repository.rotate({
          currentId: current.id,
          successor: tokenInput('fam-1', 'successor-a'),
        }),
        repository.rotate({
          currentId: current.id,
          successor: tokenInput('fam-1', 'successor-b'),
        }),
      ]);

      const winners = [a, b].filter((result) => result !== null);
      expect(winners).toHaveLength(1);

      const rows = await database().refreshToken.count({
        where: { familyId: 'fam-1' },
      });
      expect(rows).toBe(2);
    });

    it('leaves no successor behind when it loses the race', async () => {
      // A rotation that returns null must not have written anything: the
      // whole point of the transaction is that a partial rotation is worse
      // than none.
      const current = await repository.create(tokenInput('fam-1', 'first'));
      await repository.revokeFamily('fam-1');

      await repository.rotate({
        currentId: current.id,
        successor: tokenInput('fam-1', 'orphan'),
      });

      expect(await repository.findByHash('orphan')).toBeNull();
    });
  });

  describe('revocation', () => {
    it('revokes a whole family and leaves others alone', async () => {
      await repository.create(tokenInput('laptop', 'laptop-token'));
      await repository.create(tokenInput('phone', 'phone-token'));

      const revoked = await repository.revokeFamily('laptop');

      expect(revoked).toBe(1);
      expect(
        (await repository.findByHash('laptop-token'))?.revokedAt,
      ).not.toBeNull();
      expect(
        (await repository.findByHash('phone-token'))?.revokedAt,
      ).toBeNull();
    });

    it('does not rewrite an existing revocation timestamp', async () => {
      /* `revoked_at IS NULL` in the WHERE clause is what preserves the
         audit trail. Re-revoking a family — which reuse detection does,
         possibly after a sign-out already revoked part of it — must not
         move the timestamp recording when each token actually died. */
      await repository.create(tokenInput('fam-1', 'token'));
      await repository.revokeFamily('fam-1');
      const first = (await repository.findByHash('token'))?.revokedAt;

      await new Promise((resolve) => setTimeout(resolve, 20));
      const revokedAgain = await repository.revokeFamily('fam-1');

      expect(revokedAgain).toBe(0);
      expect((await repository.findByHash('token'))?.revokedAt).toEqual(first);
    });

    it('revokes every family a user has', async () => {
      await repository.create(tokenInput('laptop', 'laptop-token'));
      await repository.create(tokenInput('phone', 'phone-token'));

      const revoked = await repository.revokeAllForUser(userId);

      expect(revoked).toBe(2);
    });
  });

  describe('familyStartedAt', () => {
    it('returns the earliest creation time in the family', async () => {
      // What bounds a session absolutely: rotation slides the window
      // forward but never past this instant plus the ceiling.
      const first = await repository.create(tokenInput('fam-1', 'first'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      await repository.create(tokenInput('fam-1', 'second'));

      const startedAt = await repository.familyStartedAt('fam-1');
      const firstRow = await database().refreshToken.findUnique({
        where: { id: first.id },
        select: { createdAt: true },
      });

      expect(startedAt).toEqual(firstRow?.createdAt);
    });

    it('returns null for a family that does not exist', async () => {
      expect(await repository.familyStartedAt('nothing')).toBeNull();
    });
  });

  it("deletes a user's tokens when the user is deleted", async () => {
    // ON DELETE CASCADE, asserted rather than assumed. A schema change that
    // dropped it would leave orphaned credentials pointing at nobody.
    await repository.create(tokenInput('fam-1', 'token'));

    await database().user.delete({ where: { id: userId } });

    expect(await repository.findByHash('token')).toBeNull();
  });
});
