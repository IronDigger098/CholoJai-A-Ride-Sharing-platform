import { UserRole } from '@cholojai/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { type EmailMessage, type Mailer } from '../../common/mail/mailer.port';
import { TokenService } from '../../common/security/token.service';
import { makeTestConfig } from '../../testing/env.fixture';
import {
  type CreateUserInput,
  type UserRecord,
  type UserRepository,
} from '../users/user-repository.port';

import {
  EmailAlreadyVerifiedError,
  InvalidVerificationTokenError,
} from './auth.errors';
import { EmailVerificationService } from './email-verification.service';
import {
  type CreateVerificationTokenInput,
  type VerificationPurpose,
  type VerificationTokenRecord,
  type VerificationTokenRepository,
} from './verification-token-repository.port';

class InMemoryUserRepository implements UserRepository {
  public readonly rows: UserRecord[] = [];

  public constructor(seed: UserRecord[] = []) {
    this.rows.push(...seed);
  }

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
    throw new Error(`not used: ${input.email}`);
  }

  public async updatePasswordHash(): Promise<void> {
    /* unused */
  }

  public async markEmailVerified(userId: string): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === userId);
    const existing = this.rows[index];
    if (existing !== undefined) {
      this.rows[index] = { ...existing, emailVerifiedAt: new Date() };
    }
  }
}

/**
 * Mutable row type for the fake's own storage.
 *
 * `VerificationTokenRecord` is readonly — correct, because a caller must
 * not mutate a record the repository handed back. The fake owns its rows,
 * so it needs a writable shape internally and returns the readonly view.
 */
interface StoredToken {
  id: string;
  userId: string;
  purpose: VerificationPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

class InMemoryTokenRepository implements VerificationTokenRepository {
  public rows: StoredToken[] = [];
  private nextId = 1;

  public async create(input: CreateVerificationTokenInput): Promise<void> {
    this.rows.push({
      id: `token_${this.nextId++}`,
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
  }

  public async findByHash(
    tokenHash: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationTokenRecord | null> {
    return (
      this.rows.find(
        (row) => row.tokenHash === tokenHash && row.purpose === purpose,
      ) ?? null
    );
  }

  public async consume(tokenId: string): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === tokenId);
    if (row === undefined) return false;
    if (row.consumedAt !== null) return false;

    row.consumedAt = new Date();
    return true;
  }

  public async revokeAllForUser(
    userId: string,
    purpose: VerificationPurpose,
  ): Promise<void> {
    this.rows = this.rows.filter(
      (row) => !(row.userId === userId && row.purpose === purpose),
    );
  }
}

class RecordingMailer implements Mailer {
  public readonly sent: EmailMessage[] = [];

  public async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

const unverifiedUser: UserRecord = {
  id: 'user_1',
  email: 'nabila@example.com',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
  fullName: 'Nabila Rahman',
  phone: null,
  avatarUrl: null,
  emailVerifiedAt: null,
  createdAt: new Date('2026-08-07T00:00:00.000Z'),
  roles: [UserRole.RIDER],
};

function makeService(users: UserRecord[] = [unverifiedUser]): {
  service: EmailVerificationService;
  userRepo: InMemoryUserRepository;
  tokenRepo: InMemoryTokenRepository;
  mailer: RecordingMailer;
  tokens: TokenService;
} {
  const userRepo = new InMemoryUserRepository(users);
  const tokenRepo = new InMemoryTokenRepository();
  const mailer = new RecordingMailer();
  const tokens = new TokenService();

  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

  return {
    service: new EmailVerificationService(
      userRepo,
      tokenRepo,
      mailer,
      tokens,
      makeTestConfig(),
    ),
    userRepo,
    tokenRepo,
    mailer,
    tokens,
  };
}

/** Pull the token back out of the emailed link, as a user's click would. */
function tokenFromEmail(message: EmailMessage): string {
  const match = /token=([^\s&"]+)/u.exec(message.text);
  return decodeURIComponent(match?.[1] ?? '');
}

describe('EmailVerificationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('emails a link containing a token', async () => {
      const { service, mailer } = makeService();

      await service.sendVerificationEmail(unverifiedUser);

      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]?.to).toBe('nabila@example.com');
      expect(tokenFromEmail(mailer.sent[0]!)).toHaveLength(43);
    });

    it('points the link at the web app, not the API', async () => {
      // The page there POSTs the token to us, so it never travels as an API
      // query parameter where access logs and Referer headers would capture it.
      const { service, mailer } = makeService();

      await service.sendVerificationEmail(unverifiedUser);

      expect(mailer.sent[0]?.text).toContain(
        'http://localhost:3000/verify-email',
      );
    });

    it('stores only the hash, never the token', async () => {
      const { service, tokenRepo, mailer, tokens } = makeService();

      await service.sendVerificationEmail(unverifiedUser);
      const emailed = tokenFromEmail(mailer.sent[0]!);

      expect(tokenRepo.rows[0]?.tokenHash).not.toBe(emailed);
      expect(tokenRepo.rows[0]?.tokenHash).toBe(tokens.hash(emailed));
    });

    it('revokes an earlier token when a new one is issued', async () => {
      // Otherwise every link ever sent stays live until expiry — three
      // requests would leave three working credentials in an inbox.
      const { service, tokenRepo, mailer } = makeService();

      await service.sendVerificationEmail(unverifiedUser);
      const first = tokenFromEmail(mailer.sent[0]!);

      await service.sendVerificationEmail(unverifiedUser);

      expect(tokenRepo.rows).toHaveLength(1);
      await expect(service.verify(first)).rejects.toThrow(
        InvalidVerificationTokenError,
      );
    });

    it('refuses to issue a link for an already-verified address', async () => {
      const verified = { ...unverifiedUser, emailVerifiedAt: new Date() };
      const { service } = makeService([verified]);

      await expect(service.sendVerificationEmail(verified)).rejects.toThrow(
        EmailAlreadyVerifiedError,
      );
    });
  });

  describe('verify', () => {
    it('marks the address verified', async () => {
      const { service, mailer, userRepo } = makeService();
      await service.sendVerificationEmail(unverifiedUser);

      const user = await service.verify(tokenFromEmail(mailer.sent[0]!));

      expect(user.emailVerifiedAt).not.toBeNull();
      expect(userRepo.rows[0]?.emailVerifiedAt).not.toBeNull();
    });

    it('rejects a token that has already been used', async () => {
      // Single use. The second click must fail even seconds later.
      const { service, mailer } = makeService();
      await service.sendVerificationEmail(unverifiedUser);
      const token = tokenFromEmail(mailer.sent[0]!);

      await service.verify(token);

      await expect(service.verify(token)).rejects.toThrow(
        InvalidVerificationTokenError,
      );
    });

    it('rejects an expired token', async () => {
      const { service, mailer, tokenRepo } = makeService();
      await service.sendVerificationEmail(unverifiedUser);
      const token = tokenFromEmail(mailer.sent[0]!);

      const row = tokenRepo.rows[0];
      if (row !== undefined) row.expiresAt = new Date(Date.now() - 1000);

      await expect(service.verify(token)).rejects.toThrow(
        InvalidVerificationTokenError,
      );
    });

    it('rejects an unknown token', async () => {
      const { service, tokens } = makeService();
      await expect(service.verify(tokens.generate().plaintext)).rejects.toThrow(
        InvalidVerificationTokenError,
      );
    });

    it('gives the SAME error for unknown, expired, and used tokens', async () => {
      // Distinguishing them would confirm to someone guessing tokens that
      // they had found a real one.
      const { service, mailer, tokens } = makeService();
      await service.sendVerificationEmail(unverifiedUser);
      const token = tokenFromEmail(mailer.sent[0]!);
      await service.verify(token);

      const messages: string[] = [];
      for (const attempt of [token, tokens.generate().plaintext, 'garbage']) {
        try {
          await service.verify(attempt);
        } catch (error) {
          messages.push((error as Error).message);
        }
      }

      expect(new Set(messages).size).toBe(1);
    });
  });

  describe('resend', () => {
    it('sends a new link for an unverified address', async () => {
      const { service, mailer } = makeService();
      await service.resend('nabila@example.com');
      expect(mailer.sent).toHaveLength(1);
    });

    it('stays silent for an unknown address', async () => {
      // No 404. Answering honestly would make this a bulk address-checking
      // oracle, and the user's next step is identical either way.
      const { service, mailer } = makeService();

      await expect(
        service.resend('stranger@nowhere.test'),
      ).resolves.toBeUndefined();
      expect(mailer.sent).toHaveLength(0);
    });

    it('stays silent for an already-verified address', async () => {
      const verified = { ...unverifiedUser, emailVerifiedAt: new Date() };
      const { service, mailer } = makeService([verified]);

      await expect(service.resend(verified.email)).resolves.toBeUndefined();
      expect(mailer.sent).toHaveLength(0);
    });
  });
});
