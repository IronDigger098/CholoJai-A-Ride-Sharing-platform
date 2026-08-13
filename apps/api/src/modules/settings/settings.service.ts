import {
  MUTABLE_NOTIFICATION_KINDS,
  type NotificationKind,
  type NotificationSettings,
  type UpdateProfileRequest,
  type UserSummary,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import { ResourceNotFoundError } from '../../common/errors/domain-error';
import { PasswordHasherService } from '../../common/security/password-hasher.service';
import { RefreshTokenService } from '../auth/refresh-token.service';
import {
  USER_REPOSITORY,
  type UserRecord,
  type UserRepository,
} from '../users/user-repository.port';

import {
  NOTIFICATION_MUTE_REPOSITORY,
  type NotificationMuteRepository,
} from './notification-mute-repository.port';
import {
  CurrentPasswordIncorrectError,
  PhoneTakenError,
} from './settings.errors';

/**
 * The things a person changes about their own account.
 *
 * Everything here is scoped to the caller by construction: every method
 * takes the id from the token and none takes one from a request body. That
 * is not a convention, it is the reason there is no way to express "edit
 * somebody else" — the administrative equivalents live in `AdminModule` and
 * are gated separately.
 */
@Injectable()
export class SettingsService {
  public constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(NOTIFICATION_MUTE_REPOSITORY)
    private readonly mutes: NotificationMuteRepository,
    private readonly hasher: PasswordHasherService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  public async updateProfile(
    userId: string,
    request: UpdateProfileRequest,
  ): Promise<UserSummary> {
    try {
      const updated = await this.users.updateProfile(userId, request);

      /* Null means the row is gone or soft-deleted. The caller holds a
         valid token for an account that no longer exists — a 404 rather
         than a form error, because there is nothing to correct. */
      if (updated === null) throw new ResourceNotFoundError('User', userId);

      return toSummary(updated);
    } catch (cause) {
      /* `phone` is unique. Translating here rather than letting a P2002
         reach the filter means the rider is told which field collided. */
      if (isUniqueViolation(cause, 'phone')) throw new PhoneTakenError();
      throw cause;
    }
  }

  /**
   * Change a password, then end every session including this one.
   *
   * The revocation is the point of the feature. Somebody changing their
   * password after a lost phone or a shared laptop expects that to lock the
   * other party out, and a change that leaves existing refresh tokens
   * working does nothing for the case people actually use it for.
   *
   * Every session, not every *other* session. Keeping the current one would
   * be friendlier, and it would mean carrying a "which session is this"
   * concept through the token store for the sake of one screen. Signing out
   * everywhere is also the stronger guarantee, and it makes the rider prove
   * they know the new password by typing it once — which is worth more than
   * saving them a sign-in.
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findById(userId);

    if (user === null) throw new ResourceNotFoundError('User', userId);

    const matches = await this.hasher.verify(
      user.passwordHash,
      currentPassword,
    );

    if (!matches) throw new CurrentPasswordIncorrectError();

    await this.users.updatePasswordHash(
      userId,
      await this.hasher.hash(newPassword),
    );

    await this.refreshTokens.revokeAllSessions(userId);
  }

  public async getNotificationSettings(
    userId: string,
  ): Promise<NotificationSettings> {
    return { muted: [...(await this.mutes.listMuted(userId))] };
  }

  /**
   * Replace the muted set, ignoring anything not offered.
   *
   * The filter is a guard, not tidying. Ride events tell a rider their
   * driver is outside; a crafted request that muted those would produce
   * somebody who believes the app is broken and cannot discover why. The
   * screen only shows the mutable ones, and the server agrees rather than
   * trusting it.
   */
  public async updateNotificationSettings(
    userId: string,
    muted: readonly NotificationKind[],
  ): Promise<NotificationSettings> {
    const allowed = muted.filter((kind) =>
      MUTABLE_NOTIFICATION_KINDS.includes(kind),
    );

    return { muted: [...(await this.mutes.replace(userId, allowed))] };
  }
}

function isUniqueViolation(error: unknown, column: string): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as { code?: unknown; meta?: { target?: unknown } };

  if (candidate.code !== 'P2002') return false;

  const target = candidate.meta?.target;

  return typeof target === 'string'
    ? target === column
    : Array.isArray(target) && target.includes(column);
}

function toSummary(record: UserRecord): UserSummary {
  return {
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    phone: record.phone,
    avatarUrl: record.avatarUrl,
    emailVerified: record.emailVerifiedAt !== null,
    roles: [...record.roles],
    createdAt: record.createdAt.toISOString(),
  };
}
