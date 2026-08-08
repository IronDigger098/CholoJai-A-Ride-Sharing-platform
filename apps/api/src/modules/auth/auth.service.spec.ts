import { UserRole } from '@cholojai/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  AccessTokenService,
  accessTokenJwtOptions,
} from '../../common/security/access-token.service';
import { PasswordHasherService } from '../../common/security/password-hasher.service';
import { TokenService } from '../../common/security/token.service';
import { makeTestConfig } from '../../testing/env.fixture';
import { InMemoryRefreshTokenRepository } from '../../testing/in-memory-refresh-token.repository';
import {
  type CreateUserInput,
  type UserRecord,
  type UserRepository,
} from '../users/user-repository.port';

import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  RefreshTokenInvalidError,
  RefreshTokenReusedError,
  RefreshTokenStaleError,
} from './auth.errors';
import { AuthService, toUserSummary } from './auth.service';
import { type EmailVerificationService } from './email-verification.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * An in-memory repository standing in for Postgres.
 *
 * This is what the port abstraction buys: the whole registration flow —
 * duplicate detection, hashing, role assignment, response shaping — is
 * verified in milliseconds, with no database, no container, and no
 * network. The Prisma adapter is exercised separately by integration tests
 * (M3.9).
 */
class InMemoryUserRepository implements UserRepository {
  public readonly rows: UserRecord[] = [];
  private nextId = 1;

  public async findByEmail(email: string): Promise<UserRecord | null> {
    return this.rows.find((row) => row.email === email) ?? null;
  }

  public async findById(id: string): Promise<UserRecord | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  public async existsByEmail(email: string): Promise<boolean> {
    return this.rows.some((row) => row.email === email);
  }

  public async create(input: CreateUserInput): Promise<UserRecord> {
    const record: UserRecord = {
      id: `user_${this.nextId++}`,
      email: input.email,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
      avatarUrl: null,
      emailVerifiedAt: null,
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      roles: [...input.roles],
    };
    this.rows.push(record);
    return record;
  }

  public async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === userId);
    const existing = this.rows[index];
    if (existing !== undefined) {
      this.rows[index] = { ...existing, passwordHash };
    }
  }

  public async markEmailVerified(): Promise<void> {
    /* not exercised by these tests */
  }
}

/**
 * Records verification sends without touching a token store or a mailer.
 * `sendVerificationEmail` is the only method registration calls.
 */
class RecordingVerificationService {
  public readonly sentTo: string[] = [];
  public shouldFail = false;

  public async sendVerificationEmail(user: UserRecord): Promise<void> {
    if (this.shouldFail) throw new Error('SMTP unavailable');
    this.sentTo.push(user.email);
  }
}

describe('AuthService', () => {
  jest.setTimeout(30_000); // argon2 is intentionally slow

  const validRegistration = {
    fullName: 'Nabila Rahman',
    email: 'nabila@example.com',
    password: 'a-long-enough-passphrase',
  };

  function makeService(): {
    service: AuthService;
    users: InMemoryUserRepository;
    hasher: PasswordHasherService;
    verification: RecordingVerificationService;
    refreshTokens: InMemoryRefreshTokenRepository;
    accessTokens: AccessTokenService;
    tokens: TokenService;
  } {
    const config = makeTestConfig();
    const users = new InMemoryUserRepository();
    const hasher = new PasswordHasherService();
    const verification = new RecordingVerificationService();
    const refreshTokens = new InMemoryRefreshTokenRepository();
    const tokens = new TokenService();

    const accessTokens = new AccessTokenService(
      new JwtService(accessTokenJwtOptions(config)),
      config,
    );

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    return {
      service: new AuthService(
        users,
        hasher,
        verification as unknown as EmailVerificationService,
        accessTokens,
        new RefreshTokenService(refreshTokens, tokens, config),
      ),
      users,
      hasher,
      verification,
      refreshTokens,
      accessTokens,
      tokens,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('creates the account and reports verification is required', async () => {
      const { service } = makeService();

      const result = await service.register(validRegistration);

      expect(result.user.email).toBe('nabila@example.com');
      expect(result.user.fullName).toBe('Nabila Rahman');
      expect(result.emailVerificationRequired).toBe(true);
    });

    it('stores a hash, never the password', async () => {
      const { service, users, hasher } = makeService();

      await service.register(validRegistration);

      const stored = users.rows[0];
      expect(stored).toBeDefined();
      expect(stored?.passwordHash).not.toBe(validRegistration.password);
      expect(stored?.passwordHash).toMatch(/^\$argon2id\$/u);
      await expect(
        hasher.verify(stored?.passwordHash ?? '', validRegistration.password),
      ).resolves.toBe(true);
    });

    it('NEVER returns the password hash to the client', async () => {
      // The response shape is built field by field precisely so that adding
      // a column to the database cannot silently publish it here.
      const { service } = makeService();

      const result = await service.register(validRegistration);

      expect(JSON.stringify(result)).not.toContain('argon2');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('deletedAt');
    });

    it('grants RIDER and nothing else', async () => {
      const { service, users } = makeService();

      const result = await service.register(validRegistration);

      expect(result.user.roles).toEqual([UserRole.RIDER]);
      expect(users.rows[0]?.roles).toEqual([UserRole.RIDER]);
    });

    it('ignores any roles supplied by the caller', async () => {
      // Privilege escalation attempt. Zod strips unknown keys before this
      // point; this asserts the service would ignore them regardless —
      // defence in depth, because a single layer is one refactor from gone.
      const { service } = makeService();

      const result = await service.register({
        ...validRegistration,
        roles: [UserRole.ADMIN],
        isAdmin: true,
      } as never);

      expect(result.user.roles).toEqual([UserRole.RIDER]);
      expect(result.user.roles).not.toContain(UserRole.ADMIN);
    });

    it('starts the account unverified', async () => {
      const { service } = makeService();
      const result = await service.register(validRegistration);
      expect(result.user.emailVerified).toBe(false);
    });

    it('rejects a duplicate email', async () => {
      const { service } = makeService();

      await service.register(validRegistration);

      await expect(service.register(validRegistration)).rejects.toThrow(
        EmailAlreadyRegisteredError,
      );
    });

    it('maps a duplicate email to 409 with a stable code', async () => {
      const { service } = makeService();
      await service.register(validRegistration);

      try {
        await service.register(validRegistration);
        throw new Error('expected a conflict');
      } catch (error) {
        expect(error).toBeInstanceOf(EmailAlreadyRegisteredError);
        const conflict = error as EmailAlreadyRegisteredError;
        expect(conflict.status).toBe(409);
        expect(conflict.code).toBe('EMAIL_ALREADY_REGISTERED');
      }
    });

    it('stores an optional phone when given', async () => {
      const { service } = makeService();

      const result = await service.register({
        ...validRegistration,
        phone: '+8801712345678',
      });

      expect(result.user.phone).toBe('+8801712345678');
    });

    it('stores null when no phone is given', async () => {
      const { service } = makeService();
      const result = await service.register(validRegistration);
      expect(result.user.phone).toBeNull();
    });

    it('sends a verification email to the new address', async () => {
      const { service, verification } = makeService();

      await service.register(validRegistration);

      expect(verification.sentTo).toEqual(['nabila@example.com']);
    });

    it('still creates the account when the verification email fails', async () => {
      // The account exists and the password is stored. Failing the whole
      // request would leave the user unable to retry — their email is now
      // taken — for a problem entirely on our side. They can request a new
      // link instead.
      const { service, users, verification } = makeService();
      verification.shouldFail = true;

      const result = await service.register(validRegistration);

      expect(result.user.email).toBe('nabila@example.com');
      expect(users.rows).toHaveLength(1);
    });

    it('produces a different hash for two users with the same password', async () => {
      const { service, users } = makeService();

      await service.register(validRegistration);
      await service.register({ ...validRegistration, email: 'other@test.bd' });

      expect(users.rows[0]?.passwordHash).not.toBe(users.rows[1]?.passwordHash);
    });
  });

  describe('login', () => {
    const credentials = {
      email: validRegistration.email,
      password: validRegistration.password,
    };

    it('returns an access token, its lifetime, and the user', async () => {
      const { service, accessTokens } = makeService();
      await service.register(validRegistration);

      const { response } = await service.login(credentials);

      expect(response.tokenType).toBe('Bearer');
      expect(response.expiresIn).toBe(15 * 60);
      expect(response.user.email).toBe(credentials.email);
      expect(accessTokens.verify(response.accessToken).status).toBe('valid');
    });

    it('puts the user id and roles in the token', async () => {
      const { service, accessTokens, users } = makeService();
      await service.register(validRegistration);

      const { response } = await service.login(credentials);
      const result = accessTokens.verify(response.accessToken);

      expect(result).toMatchObject({
        status: 'valid',
        claims: { sub: users.rows[0]?.id, roles: [UserRole.RIDER] },
      });
    });

    it('never returns the refresh token in the response body', async () => {
      // It belongs in an httpOnly cookie. Putting it in the body would hand
      // it to the very scripts the cookie exists to hide it from.
      const { service } = makeService();
      await service.register(validRegistration);

      const { response, refreshToken } = await service.login(credentials);

      expect(refreshToken).toEqual(expect.any(String));
      expect(JSON.stringify(response)).not.toContain(refreshToken);
      expect(response).not.toHaveProperty('refreshToken');
    });

    it('stores only a hash of the refresh token', async () => {
      const { service, refreshTokens, tokens } = makeService();
      await service.register(validRegistration);

      const { refreshToken } = await service.login(credentials);

      expect(refreshTokens.rows[0]?.tokenHash).not.toBe(refreshToken);
      expect(refreshTokens.rows[0]?.tokenHash).toBe(tokens.hash(refreshToken));
    });

    it('gives each sign-in its own family', async () => {
      // One family per sign-in is what lets a stolen session be revoked
      // without signing the user out of their other devices.
      const { service, refreshTokens } = makeService();
      await service.register(validRegistration);

      await service.login(credentials);
      await service.login(credentials);

      expect(refreshTokens.rows).toHaveLength(2);
      expect(refreshTokens.rows[0]?.familyId).not.toBe(
        refreshTokens.rows[1]?.familyId,
      );
    });

    it('rejects a wrong password', async () => {
      const { service } = makeService();
      await service.register(validRegistration);

      await expect(
        service.login({ ...credentials, password: 'wrong-but-long-enough' }),
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('rejects an unknown address with the SAME error', async () => {
      // Two different messages here would let anyone with a wordlist
      // discover which addresses hold accounts.
      const { service } = makeService();
      await service.register(validRegistration);

      const messages: string[] = [];
      for (const attempt of [
        { ...credentials, password: 'wrong-but-long-enough' },
        { email: 'stranger@nowhere.test', password: credentials.password },
      ]) {
        await service.login(attempt).catch((error: unknown) => {
          messages.push((error as Error).message);
        });
      }

      expect(messages).toHaveLength(2);
      expect(new Set(messages).size).toBe(1);
    });

    it('maps a failed sign-in to 401 with a stable code', async () => {
      const { service } = makeService();

      try {
        await service.login(credentials);
        throw new Error('expected a rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidCredentialsError);
        const failure = error as InvalidCredentialsError;
        expect(failure.status).toBe(401);
        expect(failure.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('hashes a decoy when no account exists, to equalise timing', async () => {
      /* Asserted behaviourally rather than by measuring a stopwatch, which
         would be flaky on shared CI hardware. What must never regress is
         that the no-user path still performs an argon2 verification —
         without it, a fast 401 means "no account" and a slow one means
         "wrong password", and the identical error message above becomes
         theatre. */
      const { service, hasher } = makeService();
      const decoy = jest.spyOn(hasher, 'verifyAgainstDecoy');

      await service
        .login({ email: 'stranger@nowhere.test', password: 'anything-at-all' })
        .catch(() => undefined);

      expect(decoy).toHaveBeenCalledTimes(1);
    });

    it('lets an unverified account sign in', async () => {
      /* Deliberate. Refusing would return a different error for a real
         account than for a fake one — enumeration through the front door —
         and would strand anyone whose verification mail bounced. */
      const { service } = makeService();
      await service.register(validRegistration);

      const { response } = await service.login(credentials);

      expect(response.user.emailVerified).toBe(false);
    });

    it('upgrades a hash stored with weaker parameters', async () => {
      // Successful login is the only moment the plaintext is legitimately
      // in memory, so it is the only moment this can happen.
      const { service, users, hasher } = makeService();
      await service.register(validRegistration);

      const legacyHash = users.rows[0]?.passwordHash ?? '';
      jest.spyOn(hasher, 'needsRehash').mockReturnValue(true);

      await service.login(credentials);

      expect(users.rows[0]?.passwordHash).not.toBe(legacyHash);
      await expect(
        hasher.verify(users.rows[0]?.passwordHash ?? '', credentials.password),
      ).resolves.toBe(true);
    });

    it('still signs in when the hash upgrade fails', async () => {
      // The user typed the right password. A storage hiccup on an
      // optimisation must not become a failed sign-in.
      const { service, users, hasher } = makeService();
      await service.register(validRegistration);

      jest.spyOn(hasher, 'needsRehash').mockReturnValue(true);
      jest
        .spyOn(users, 'updatePasswordHash')
        .mockRejectedValue(new Error('database unavailable'));

      await expect(service.login(credentials)).resolves.toBeDefined();
    });
  });

  describe('logout', () => {
    const credentials = {
      email: validRegistration.email,
      password: validRegistration.password,
    };

    it('revokes the token it was given', async () => {
      const { service, refreshTokens } = makeService();
      await service.register(validRegistration);
      const { refreshToken } = await service.login(credentials);

      await service.logout(refreshToken);

      expect(refreshTokens.rows[0]?.revokedAt).not.toBeNull();
    });

    it('leaves other sessions alone', async () => {
      // Signing out of a laptop must not sign the user out of their phone.
      const { service, refreshTokens } = makeService();
      await service.register(validRegistration);
      const laptop = await service.login(credentials);
      await service.login(credentials);

      await service.logout(laptop.refreshToken);

      expect(refreshTokens.rows[0]?.revokedAt).not.toBeNull();
      expect(refreshTokens.rows[1]?.revokedAt).toBeNull();
    });

    it('accepts a missing or unknown token without complaint', async () => {
      // The caller is signed out either way, and an error would tell
      // someone probing with stolen cookies which of them were real.
      const { service } = makeService();

      await expect(service.logout(null)).resolves.toBeUndefined();
      await expect(service.logout('not-a-real-token')).resolves.toBeUndefined();
    });
  });

  describe('refresh', () => {
    const credentials = {
      email: validRegistration.email,
      password: validRegistration.password,
    };

    it('returns a new access token and a new refresh token', async () => {
      const { service, accessTokens } = makeService();
      await service.register(validRegistration);
      const session = await service.login(credentials);

      const refreshed = await service.refresh(session.refreshToken);

      expect(refreshed.refreshToken).not.toBe(session.refreshToken);
      expect(accessTokens.verify(refreshed.response.accessToken).status).toBe(
        'valid',
      );
    });

    it('rejects the old token once it has been rotated', async () => {
      const { service, refreshTokens, tokens } = makeService();
      await service.register(validRegistration);
      const session = await service.login(credentials);

      await service.refresh(session.refreshToken);

      /* Age the rotation past the grace window so this reads as reuse
         rather than as one of the user's own concurrent requests. */
      const row = refreshTokens.byHash(tokens.hash(session.refreshToken));
      if (row?.revokedAt != null) {
        row.revokedAt = new Date(row.revokedAt.getTime() - 60_000);
      }

      await expect(service.refresh(session.refreshToken)).rejects.toThrow(
        RefreshTokenReusedError,
      );
    });

    it('tells a concurrent replay to retry instead of revoking', async () => {
      const { service } = makeService();
      await service.register(validRegistration);
      const session = await service.login(credentials);

      await service.refresh(session.refreshToken);

      await expect(service.refresh(session.refreshToken)).rejects.toThrow(
        RefreshTokenStaleError,
      );
    });

    it('rejects a missing cookie', async () => {
      const { service } = makeService();

      await expect(service.refresh(null)).rejects.toThrow(
        RefreshTokenInvalidError,
      );
    });

    it('picks up a role granted since the token was issued', async () => {
      /* Refreshing is the moment a role change propagates. Rebuilding the
         claims from the old token instead of from the database would mean
         an approved driver stayed a rider forever. */
      const { service, users, accessTokens } = makeService();
      await service.register(validRegistration);
      const session = await service.login(credentials);

      const existing = users.rows[0];
      if (existing !== undefined) {
        users.rows[0] = {
          ...existing,
          roles: [UserRole.RIDER, UserRole.DRIVER],
        };
      }

      const refreshed = await service.refresh(session.refreshToken);

      expect(accessTokens.verify(refreshed.response.accessToken)).toMatchObject(
        {
          status: 'valid',
          claims: { roles: [UserRole.RIDER, UserRole.DRIVER] },
        },
      );
    });

    it('kills the session when the account has been deactivated', async () => {
      /* The repository hides soft-deleted users; it does not hide their
         sessions. Left alone, a deactivated account could keep rotating
         indefinitely. */
      const { service, users, refreshTokens } = makeService();
      await service.register(validRegistration);
      const session = await service.login(credentials);

      jest.spyOn(users, 'findById').mockResolvedValue(null);

      await expect(service.refresh(session.refreshToken)).rejects.toThrow(
        RefreshTokenInvalidError,
      );
      expect(refreshTokens.rows.every((row) => row.revokedAt !== null)).toBe(
        true,
      );
    });

    it('cannot be used after signing out', async () => {
      const { service } = makeService();
      await service.register(validRegistration);
      const session = await service.login(credentials);

      await service.logout(session.refreshToken);

      await expect(service.refresh(session.refreshToken)).rejects.toThrow(
        RefreshTokenInvalidError,
      );
    });
  });

  describe('getProfile', () => {
    it('reads the user fresh rather than from token claims', async () => {
      const { service, users } = makeService();
      await service.register(validRegistration);
      const id = users.rows[0]?.id ?? '';

      // A role granted after the token was issued must still show up here.
      const existing = users.rows[0];
      if (existing !== undefined) {
        users.rows[0] = {
          ...existing,
          roles: [UserRole.RIDER, UserRole.DRIVER],
        };
      }

      const { user } = await service.getProfile(id);

      expect(user.roles).toEqual([UserRole.RIDER, UserRole.DRIVER]);
    });

    it('404s for a token whose account no longer exists', async () => {
      const { service } = makeService();

      await expect(service.getProfile('user_gone')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('toUserSummary', () => {
    const record: UserRecord = {
      id: 'user_1',
      email: 'nabila@example.com',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$secret$secret',
      fullName: 'Nabila Rahman',
      phone: null,
      avatarUrl: null,
      emailVerifiedAt: null,
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      roles: [UserRole.RIDER],
    };

    it('omits the password hash', () => {
      const summary = toUserSummary(record);
      expect(JSON.stringify(summary)).not.toContain('argon2');
    });

    it('reports verification as a boolean, not a timestamp', () => {
      expect(toUserSummary(record).emailVerified).toBe(false);
      expect(
        toUserSummary({ ...record, emailVerifiedAt: new Date() }).emailVerified,
      ).toBe(true);
    });

    it('serialises dates as ISO 8601 strings', () => {
      expect(toUserSummary(record).createdAt).toBe('2026-08-07T00:00:00.000Z');
    });
  });
});
