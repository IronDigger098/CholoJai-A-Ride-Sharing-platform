import { UserRole } from '@cholojai/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { PasswordHasherService } from '../../common/security/password-hasher.service';
import {
  type CreateUserInput,
  type UserRecord,
  type UserRepository,
} from '../users/user-repository.port';

import { EmailAlreadyRegisteredError } from './auth.errors';
import { AuthService, toUserSummary } from './auth.service';
import { type EmailVerificationService } from './email-verification.service';

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

  public async updatePasswordHash(): Promise<void> {
    /* not exercised by these tests */
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
  } {
    const users = new InMemoryUserRepository();
    const hasher = new PasswordHasherService();
    const verification = new RecordingVerificationService();

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    return {
      service: new AuthService(
        users,
        hasher,
        verification as unknown as EmailVerificationService,
      ),
      users,
      hasher,
      verification,
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
