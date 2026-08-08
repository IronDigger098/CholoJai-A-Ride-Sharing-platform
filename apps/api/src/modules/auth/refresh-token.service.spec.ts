import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { TokenService } from '../../common/security/token.service';
import { makeTestConfig } from '../../testing/env.fixture';
import { InMemoryRefreshTokenRepository } from '../../testing/in-memory-refresh-token.repository';

import { RefreshTokenService } from './refresh-token.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeService(overrides: Record<string, string> = {}): {
  service: RefreshTokenService;
  store: InMemoryRefreshTokenRepository;
  tokens: TokenService;
} {
  const store = new InMemoryRefreshTokenRepository();
  const tokens = new TokenService();

  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  return {
    service: new RefreshTokenService(store, tokens, makeTestConfig(overrides)),
    store,
    tokens,
  };
}

/**
 * Move a token's rotation timestamp into the past.
 *
 * Reaching into the fake rather than waiting, or mocking the clock
 * globally: the grace window is measured against `revokedAt`, so ageing
 * that single field is the smallest change that reproduces "this was
 * rotated a while ago" — and it leaves `Date.now()` alone for everything
 * else in the test.
 */
function ageRotationBy(
  store: InMemoryRefreshTokenRepository,
  tokenHash: string,
  ms: number,
): void {
  const row = store.byHash(tokenHash);
  if (row?.revokedAt != null) {
    row.revokedAt = new Date(row.revokedAt.getTime() - ms);
  }
}

describe('RefreshTokenService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('issueForNewSession', () => {
    it('gives every sign-in its own family', async () => {
      const { service } = makeService();

      const first = await service.issueForNewSession('user_1');
      const second = await service.issueForNewSession('user_1');

      expect(first.record.familyId).not.toBe(second.record.familyId);
    });

    it('stores a hash, never the token', async () => {
      const { service, store, tokens } = makeService();

      const issued = await service.issueForNewSession('user_1');

      expect(store.rows[0]?.tokenHash).toBe(tokens.hash(issued.plaintext));
      expect(store.rows[0]?.tokenHash).not.toBe(issued.plaintext);
    });
  });

  describe('rotate', () => {
    it('issues a successor and retires the token presented', async () => {
      const { service, store, tokens } = makeService();
      const first = await service.issueForNewSession('user_1');

      const outcome = await service.rotate(first.plaintext);

      expect(outcome.status).toBe('rotated');
      const retired = store.byHash(tokens.hash(first.plaintext));
      expect(retired?.revokedAt).not.toBeNull();
      expect(retired?.replacedById).toBe(store.rows[1]?.id);
    });

    it('keeps the successor in the same family', async () => {
      // Continuity is the whole mechanism: without a shared family there is
      // nothing to revoke when reuse is detected.
      const { service, store } = makeService();
      const first = await service.issueForNewSession('user_1');

      await service.rotate(first.plaintext);

      expect(store.rows[1]?.familyId).toBe(store.rows[0]?.familyId);
    });

    it('returns a different token each time', async () => {
      const { service } = makeService();
      const first = await service.issueForNewSession('user_1');

      const second = await service.rotate(first.plaintext);
      if (second.status !== 'rotated') throw new Error('expected a rotation');

      expect(second.plaintext).not.toBe(first.plaintext);

      const third = await service.rotate(second.plaintext);
      if (third.status !== 'rotated') throw new Error('expected a rotation');

      expect(third.plaintext).not.toBe(second.plaintext);
    });

    it('rejects a token that never existed', async () => {
      const { service, tokens } = makeService();

      const outcome = await service.rotate(tokens.generate().plaintext);

      expect(outcome.status).toBe('invalid');
    });

    it('rejects an expired token', async () => {
      const { service, store } = makeService();
      const issued = await service.issueForNewSession('user_1');

      const row = store.rows[0];
      if (row !== undefined) row.expiresAt = new Date(Date.now() - 1000);

      expect((await service.rotate(issued.plaintext)).status).toBe('invalid');
    });
  });

  describe('reuse detection', () => {
    it('revokes the whole family when a rotated token comes back', async () => {
      /* The scenario the mechanism exists for. A thief holds a copy of T1.
         Whoever refreshes second presents a token that was already
         exchanged — and since we cannot tell thief from owner, both lose
         the session. Only the party who knows the password returns. */
      const { service, store, tokens } = makeService();
      const first = await service.issueForNewSession('user_1');

      const second = await service.rotate(first.plaintext);
      if (second.status !== 'rotated') throw new Error('expected a rotation');

      ageRotationBy(store, tokens.hash(first.plaintext), 60_000);

      const replay = await service.rotate(first.plaintext);

      expect(replay).toEqual({ status: 'reused', userId: 'user_1' });
      expect(store.rows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('kills the successor too, not just the replayed token', async () => {
      // Revoking one row would leave whoever holds the newer token — quite
      // possibly the attacker — with a working session.
      const { service, store, tokens } = makeService();
      const first = await service.issueForNewSession('user_1');
      const second = await service.rotate(first.plaintext);
      if (second.status !== 'rotated') throw new Error('expected a rotation');

      ageRotationBy(store, tokens.hash(first.plaintext), 60_000);
      await service.rotate(first.plaintext);

      expect((await service.rotate(second.plaintext)).status).toBe('invalid');
    });

    it('leaves other sessions untouched', async () => {
      // Theft on a laptop must not sign the user out of their phone.
      const { service, store, tokens } = makeService();
      const laptop = await service.issueForNewSession('user_1');
      const phone = await service.issueForNewSession('user_1');

      await service.rotate(laptop.plaintext);
      ageRotationBy(store, tokens.hash(laptop.plaintext), 60_000);
      await service.rotate(laptop.plaintext);

      expect(store.byHash(tokens.hash(phone.plaintext))?.revokedAt).toBeNull();
    });

    it('does NOT alarm on a token revoked by signing out', async () => {
      /* A signed-out token has no successor, so replaying it proves
         nothing — a client retrying its last request after the user hit
         sign-out looks exactly like this. Alarming here would log a fake
         theft on every sign-out and train everyone to ignore the warning. */
      const { service } = makeService();
      const issued = await service.issueForNewSession('user_1');

      await service.revokeSession(issued.plaintext);

      expect((await service.rotate(issued.plaintext)).status).toBe('invalid');
    });
  });

  describe('the concurrency grace window', () => {
    it('treats an immediate replay as stale, not theft', async () => {
      // Two tabs, or a retry through a tunnel. The winning response already
      // carried the new cookie, so the client just tries again.
      const { service, store } = makeService();
      const first = await service.issueForNewSession('user_1');

      await service.rotate(first.plaintext);
      const replay = await service.rotate(first.plaintext);

      expect(replay.status).toBe('stale');
      expect(store.rows.some((row) => row.revokedAt === null)).toBe(true);
    });

    it('keeps the successor alive through a stale replay', async () => {
      // The point of the grace window: the honest client's new token must
      // survive its own duplicate request.
      const { service } = makeService();
      const first = await service.issueForNewSession('user_1');
      const second = await service.rotate(first.plaintext);
      if (second.status !== 'rotated') throw new Error('expected a rotation');

      await service.rotate(first.plaintext);

      expect((await service.rotate(second.plaintext)).status).toBe('rotated');
    });

    it('closes the window once the grace period passes', async () => {
      const { service, store, tokens } = makeService();
      const first = await service.issueForNewSession('user_1');
      await service.rotate(first.plaintext);

      ageRotationBy(store, tokens.hash(first.plaintext), 11_000);

      expect((await service.rotate(first.plaintext)).status).toBe('reused');
    });

    it('alarms immediately when the grace window is configured to zero', async () => {
      // The strict setting. Any replay at all is theft.
      const { service } = makeService({ REFRESH_ROTATION_GRACE_SECONDS: '0' });
      const first = await service.issueForNewSession('user_1');
      await service.rotate(first.plaintext);

      expect((await service.rotate(first.plaintext)).status).toBe('reused');
    });

    it('produces exactly one successor from two concurrent rotations', async () => {
      /* Both requests read the same live token before either writes. Only
         one may win — two successors in one family would mean two live
         credentials and no way to tell a duplicate from a theft ever again. */
      const { service } = makeService();
      const first = await service.issueForNewSession('user_1');

      const [a, b] = await Promise.all([
        service.rotate(first.plaintext),
        service.rotate(first.plaintext),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(['rotated', 'stale']);
    });
  });

  describe('the absolute session ceiling', () => {
    it('slides the window forward on an ordinary rotation', async () => {
      const { service, store } = makeService();
      const first = await service.issueForNewSession('user_1');

      const before = store.rows[0]?.expiresAt.getTime() ?? 0;
      await service.rotate(first.plaintext);
      const after = store.rows[1]?.expiresAt.getTime() ?? 0;

      expect(after).toBeGreaterThanOrEqual(before);
      expect(after).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS + 1000);
    });

    it('never extends a session past thirty days from sign-in', async () => {
      /* Without this clamp, rotation would make sessions LESS bounded than
         they were before it existed — refresh once a week and the session
         never ends. */
      const { service, store } = makeService();

      // The family started 29 days ago.
      store.now = () => new Date(Date.now() - 29 * DAY_MS);
      const first = await service.issueForNewSession('user_1');
      store.now = () => new Date();

      const row = store.rows[0];
      if (row !== undefined) row.expiresAt = new Date(Date.now() + DAY_MS);

      await service.rotate(first.plaintext);

      const ceiling = Date.now() + DAY_MS;
      expect(store.rows[1]?.expiresAt.getTime()).toBeLessThanOrEqual(
        ceiling + 1000,
      );
    });

    it('refuses to rotate once the ceiling has passed', async () => {
      const { service, store } = makeService();

      store.now = () => new Date(Date.now() - 31 * DAY_MS);
      const first = await service.issueForNewSession('user_1');
      store.now = () => new Date();

      // The token itself is still unexpired; only the family has aged out.
      const row = store.rows[0];
      if (row !== undefined) row.expiresAt = new Date(Date.now() + DAY_MS);

      expect((await service.rotate(first.plaintext)).status).toBe('invalid');
    });
  });
});
