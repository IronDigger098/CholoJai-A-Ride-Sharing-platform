import { UserRole } from '@cholojai/shared';
import { beforeEach, expect, it } from '@jest/globals';

import {
  describeWithDatabase,
  useTestDatabase,
} from '../../testing/integration-database';
import { PrismaUserRepository } from '../users/prisma-user.repository';

import { PrismaVerificationTokenRepository } from './prisma-verification-token.repository';

const HOUR_MS = 60 * 60 * 1000;

describeWithDatabase(
  'PrismaVerificationTokenRepository (real database)',
  () => {
    const database = useTestDatabase();
    let repository: PrismaVerificationTokenRepository;
    let userId: string;

    beforeEach(async () => {
      const prisma = database();
      repository = new PrismaVerificationTokenRepository(prisma);

      const user = await new PrismaUserRepository(prisma).create({
        email: 'rider@cholojai.test',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
        fullName: 'Test Rider',
        roles: [UserRole.RIDER],
      });

      userId = user.id;
    });

    async function issue(
      purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
      hash: string,
    ): Promise<void> {
      await repository.create({
        userId,
        purpose,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + HOUR_MS),
      });
    }

    it('round-trips a token by hash and purpose', async () => {
      await issue('EMAIL_VERIFY', 'verify-hash');

      const found = await repository.findByHash('verify-hash', 'EMAIL_VERIFY');

      expect(found?.userId).toBe(userId);
      expect(found?.consumedAt).toBeNull();
    });

    it('will not return a token issued for a different purpose', async () => {
      /* Purpose isolation, against a real row rather than a fake's filter.
       Both flows share one table, so without this a verification link —
       longer-lived and issued far more freely — would double as an
       account-takeover credential on the password-reset endpoint. */
      await issue('EMAIL_VERIFY', 'shared-hash');

      expect(
        await repository.findByHash('shared-hash', 'PASSWORD_RESET'),
      ).toBeNull();
    });

    describe('consume', () => {
      it('succeeds once and then refuses', async () => {
        await issue('EMAIL_VERIFY', 'token');
        const record = await repository.findByHash('token', 'EMAIL_VERIFY');

        expect(await repository.consume(record?.id ?? '')).toBe(true);
        expect(await repository.consume(record?.id ?? '')).toBe(false);
      });

      it('succeeds exactly once under concurrent requests', async () => {
        /* Single use, proven against the database rather than asserted about
         a fake. Two clicks on one emailed link arrive together; the
         conditional `UPDATE … WHERE consumed_at IS NULL` is what makes
         exactly one of them win. A read-then-write would let both pass the
         check before either committed. */
        await issue('PASSWORD_RESET', 'token');
        const record = await repository.findByHash('token', 'PASSWORD_RESET');
        const id = record?.id ?? '';

        const results = await Promise.all([
          repository.consume(id),
          repository.consume(id),
          repository.consume(id),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it('returns false for a token that does not exist', async () => {
        expect(await repository.consume('nothing')).toBe(false);
      });
    });

    describe('revokeAllForUser', () => {
      it('removes only the given purpose', async () => {
        // Requesting a new verification link must not invalidate a reset link
        // the same person is halfway through using.
        await issue('EMAIL_VERIFY', 'verify-hash');
        await issue('PASSWORD_RESET', 'reset-hash');

        await repository.revokeAllForUser(userId, 'EMAIL_VERIFY');

        expect(
          await repository.findByHash('verify-hash', 'EMAIL_VERIFY'),
        ).toBeNull();
        expect(
          await repository.findByHash('reset-hash', 'PASSWORD_RESET'),
        ).not.toBeNull();
      });

      it('leaves consumed tokens in place', async () => {
        /* It deletes only outstanding tokens. A consumed row is history, and
         the audit trail for "this address was verified" is worth keeping
         even though the credential is spent. */
        await issue('EMAIL_VERIFY', 'token');
        const record = await repository.findByHash('token', 'EMAIL_VERIFY');
        await repository.consume(record?.id ?? '');

        await repository.revokeAllForUser(userId, 'EMAIL_VERIFY');

        expect(
          await database().verificationToken.count({ where: { userId } }),
        ).toBe(1);
      });
    });

    it('rejects a duplicate token hash', async () => {
      await issue('EMAIL_VERIFY', 'same');

      await expect(issue('PASSWORD_RESET', 'same')).rejects.toThrow();
    });
  },
);
