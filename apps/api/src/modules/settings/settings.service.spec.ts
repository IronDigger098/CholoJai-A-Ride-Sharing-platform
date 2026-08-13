import { NotificationKind } from '@cholojai/shared';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { ResourceNotFoundError } from '../../common/errors/domain-error';
import { type PasswordHasherService } from '../../common/security/password-hasher.service';
import { InMemoryNotificationMuteRepository } from '../../testing/in-memory-notification-mute.repository';
import { InMemoryUserRepository } from '../../testing/in-memory-user.repository';
import { type RefreshTokenService } from '../auth/refresh-token.service';

import { CurrentPasswordIncorrectError } from './settings.errors';
import { SettingsService } from './settings.service';

const CURRENT = 'correct horse battery';
const NEXT = 'Staple-Battery-99';

describe('SettingsService', () => {
  let users: InMemoryUserRepository;
  let mutes: InMemoryNotificationMuteRepository;
  let revoked: string[];
  let service: SettingsService;
  let userId: string;

  /**
   * A hasher that stores plaintext with a marker.
   *
   * Argon2 is deliberately slow — that is its job — and running it for
   * every assertion here would turn a millisecond suite into a minute one
   * to verify logic that never touches the algorithm.
   */
  const hasher = {
    hash: (plaintext: string) => Promise.resolve(`hashed:${plaintext}`),
    verify: (hashed: string, plaintext: string) =>
      Promise.resolve(hashed === `hashed:${plaintext}`),
  } as unknown as PasswordHasherService;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    mutes = new InMemoryNotificationMuteRepository();
    revoked = [];

    const refreshTokens = {
      revokeAllSessions: (id: string) => {
        revoked.push(id);
        return Promise.resolve(1);
      },
    } as unknown as RefreshTokenService;

    service = new SettingsService(users, mutes, hasher, refreshTokens);

    const created = await users.create({
      email: 'rider@cholojai.test',
      passwordHash: `hashed:${CURRENT}`,
      fullName: 'Nabila Rahman',
      roles: [],
    });

    userId = created.id;
  });

  describe('updateProfile', () => {
    it('changes only what was sent', async () => {
      const updated = await service.updateProfile(userId, {
        fullName: 'Nabila R.',
      });

      expect(updated.fullName).toBe('Nabila R.');
      expect(updated.email).toBe('rider@cholojai.test');
    });

    it('tells apart clearing a field from not mentioning it', async () => {
      /* The reason `phone` is nullable *and* optional. A client that only
         renders a name must not blank a number it never showed. */
      await service.updateProfile(userId, { phone: '01712345678' });

      await service.updateProfile(userId, { fullName: 'Nabila R.' });
      expect((await users.findById(userId))?.phone).toBe('01712345678');

      await service.updateProfile(userId, { phone: null });
      expect((await users.findById(userId))?.phone).toBeNull();
    });

    it('refuses an account that no longer exists', async () => {
      await expect(
        service.updateProfile('user_nope', { fullName: 'Ghost' }),
      ).rejects.toThrow(ResourceNotFoundError);
    });
  });

  describe('changePassword', () => {
    it('replaces the hash when the current password matches', async () => {
      await service.changePassword(userId, CURRENT, NEXT);

      expect((await users.findById(userId))?.passwordHash).toBe(
        `hashed:${NEXT}`,
      );
    });

    it('refuses a wrong current password', async () => {
      await expect(
        service.changePassword(userId, 'not it', NEXT),
      ).rejects.toThrow(CurrentPasswordIncorrectError);
    });

    it('leaves the old password working when the check fails', async () => {
      await expect(
        service.changePassword(userId, 'not it', NEXT),
      ).rejects.toThrow(CurrentPasswordIncorrectError);

      expect((await users.findById(userId))?.passwordHash).toBe(
        `hashed:${CURRENT}`,
      );
    });

    it('signs every session out', async () => {
      /* The point of the feature. A change that left refresh tokens working
         would do nothing for the lost-phone case people actually use it
         for. */
      await service.changePassword(userId, CURRENT, NEXT);

      expect(revoked).toEqual([userId]);
    });

    it('revokes nothing when the change is refused', async () => {
      await expect(
        service.changePassword(userId, 'not it', NEXT),
      ).rejects.toThrow(CurrentPasswordIncorrectError);

      expect(revoked).toEqual([]);
    });
  });

  describe('notification settings', () => {
    it('starts with nothing muted', async () => {
      /* Only exceptions are stored, so somebody who has never opened
         settings hears everything. */
      expect(await service.getNotificationSettings(userId)).toEqual({
        muted: [],
      });
    });

    it('stores a category the rider switched off', async () => {
      const settings = await service.updateNotificationSettings(userId, [
        NotificationKind.DRIVER_APPLICATION_APPROVED,
      ]);

      expect(settings.muted).toEqual([
        NotificationKind.DRIVER_APPLICATION_APPROVED,
      ]);
    });

    it('replaces the set rather than adding to it', async () => {
      await service.updateNotificationSettings(userId, [
        NotificationKind.DRIVER_APPLICATION_APPROVED,
      ]);

      const settings = await service.updateNotificationSettings(userId, [
        NotificationKind.DRIVER_APPLICATION_REJECTED,
      ]);

      expect(settings.muted).toEqual([
        NotificationKind.DRIVER_APPLICATION_REJECTED,
      ]);
    });

    it('ignores a request to mute ride events', async () => {
      /* Not refused — ignored. A crafted request that silenced these would
         produce a rider who never learns their driver arrived and concludes
         the app is broken. The screen does not offer them and the server
         agrees rather than trusting it. */
      const settings = await service.updateNotificationSettings(userId, [
        NotificationKind.RIDE_ACCEPTED,
        NotificationKind.DRIVER_APPLICATION_APPROVED,
      ]);

      expect(settings.muted).toEqual([
        NotificationKind.DRIVER_APPLICATION_APPROVED,
      ]);
    });

    it('turns everything back on with an empty set', async () => {
      await service.updateNotificationSettings(userId, [
        NotificationKind.DRIVER_APPLICATION_APPROVED,
      ]);

      expect(await service.updateNotificationSettings(userId, [])).toEqual({
        muted: [],
      });
    });
  });
});
