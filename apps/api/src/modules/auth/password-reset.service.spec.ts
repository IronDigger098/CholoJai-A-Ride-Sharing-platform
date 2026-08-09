import { UserRole } from '@cholojai/shared';
import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { type EmailMessage, type Mailer } from '../../common/mail/mailer.port';
import { PasswordHasherService } from '../../common/security/password-hasher.service';
import { TokenService } from '../../common/security/token.service';
import { makeTestConfig } from '../../testing/env.fixture';
import { InMemoryRefreshTokenRepository } from '../../testing/in-memory-refresh-token.repository';
import { InMemoryUserRepository } from '../../testing/in-memory-user.repository';
import { type UserRecord } from '../users/user-repository.port';

import { InvalidPasswordResetTokenError } from './auth.errors';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenService } from './refresh-token.service';
import {
  type CreateVerificationTokenInput,
  type VerificationPurpose,
  type VerificationTokenRecord,
  type VerificationTokenRepository,
} from './verification-token-repository.port';

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
  public shouldFail = false;

  public async send(message: EmailMessage): Promise<void> {
    if (this.shouldFail) throw new Error('SMTP unavailable');
    this.sent.push(message);
  }
}

const OLD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$oldsalt$oldhash';

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user_1',
    email: 'nabila@example.com',
    passwordHash: OLD_HASH,
    fullName: 'Nabila Rahman',
    phone: null,
    avatarUrl: null,
    emailVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    roles: [UserRole.RIDER],
    ...overrides,
  };
}

function makeService(users: UserRecord[] = [makeUser()]): {
  service: PasswordResetService;
  userRepo: InMemoryUserRepository;
  tokenRepo: InMemoryTokenRepository;
  refreshTokens: InMemoryRefreshTokenRepository;
  mailer: RecordingMailer;
  tokens: TokenService;
  hasher: PasswordHasherService;
} {
  const config = makeTestConfig();
  const userRepo = new InMemoryUserRepository(users);
  const tokenRepo = new InMemoryTokenRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const mailer = new RecordingMailer();
  const tokens = new TokenService();
  const hasher = new PasswordHasherService();

  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  return {
    service: new PasswordResetService(
      userRepo,
      tokenRepo,
      mailer,
      tokens,
      hasher,
      new RefreshTokenService(refreshTokens, tokens, config),
      config,
    ),
    userRepo,
    tokenRepo,
    refreshTokens,
    mailer,
    tokens,
    hasher,
  };
}

/** Pull the token out of the emailed link, as clicking it would. */
function tokenFromEmail(message: EmailMessage): string {
  const match = /token=([^\s&"]+)/u.exec(message.text);
  return decodeURIComponent(match?.[1] ?? '');
}

/** The mail is sent without being awaited, so let the microtask run. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('PasswordResetService', () => {
  jest.setTimeout(30_000); // argon2 is intentionally slow

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('request', () => {
    it('emails a reset link', async () => {
      const { service, mailer } = makeService();

      await service.request('nabila@example.com');
      await flush();

      expect(mailer.sent).toHaveLength(1);
      expect(tokenFromEmail(mailer.sent[0]!)).toHaveLength(43);
    });

    it('points the link at the web app, not the API', async () => {
      const { service, mailer } = makeService();

      await service.request('nabila@example.com');
      await flush();

      expect(mailer.sent[0]?.text).toContain(
        'http://localhost:3000/reset-password',
      );
    });

    it('stores only a hash of the token', async () => {
      const { service, tokenRepo, mailer, tokens } = makeService();

      await service.request('nabila@example.com');
      await flush();
      const emailed = tokenFromEmail(mailer.sent[0]!);

      expect(tokenRepo.rows[0]?.tokenHash).not.toBe(emailed);
      expect(tokenRepo.rows[0]?.tokenHash).toBe(tokens.hash(emailed));
    });

    it('stays silent for an unknown address', async () => {
      /* No 404, no error. The caller's next step is identical either way —
         check your inbox — so answering honestly would buy them nothing and
         hand an attacker a bulk address-checking oracle. */
      const { service, mailer } = makeService();

      await expect(
        service.request('stranger@nowhere.test'),
      ).resolves.toBeUndefined();
      await flush();

      expect(mailer.sent).toHaveLength(0);
    });

    it('does not wait for the mail to be sent', async () => {
      /* The timing half of enumeration resistance. If a known address waits
         for SMTP and an unknown one returns immediately, the identical
         response body is worth nothing against a stopwatch. */
      const { service, mailer } = makeService();
      let released: (() => void) | undefined;

      jest.spyOn(mailer, 'send').mockImplementation(
        async () =>
          new Promise<void>((resolve) => {
            released = resolve;
          }),
      );

      await expect(
        service.request('nabila@example.com'),
      ).resolves.toBeUndefined();

      // The request resolved while the mailer is still hanging.
      expect(released).toBeDefined();
      released?.();
    });

    it('revokes an earlier link when a new one is issued', async () => {
      /* Otherwise three clicks on "forgot password" leave three working
         account-takeover credentials sitting in one inbox. */
      const { service, tokenRepo, mailer } = makeService();

      await service.request('nabila@example.com');
      await flush();
      const first = tokenFromEmail(mailer.sent[0]!);

      await service.request('nabila@example.com');
      await flush();

      expect(tokenRepo.rows).toHaveLength(1);
      await expect(
        service.reset(first, 'a-brand-new-passphrase'),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
    });

    it('still succeeds when the mail fails to send', async () => {
      const { service, mailer } = makeService();
      mailer.shouldFail = true;

      await expect(
        service.request('nabila@example.com'),
      ).resolves.toBeUndefined();
      await flush();
    });
  });

  describe('reset', () => {
    async function requestToken(): Promise<{
      harness: ReturnType<typeof makeService>;
      token: string;
    }> {
      const harness = makeService();
      await harness.service.request('nabila@example.com');
      await flush();

      return { harness, token: tokenFromEmail(harness.mailer.sent[0]!) };
    }

    it('replaces the stored password hash', async () => {
      const { harness, token } = await requestToken();

      await harness.service.reset(token, 'a-brand-new-passphrase');

      const stored = harness.userRepo.rows[0]?.passwordHash ?? '';
      expect(stored).not.toBe(OLD_HASH);
      await expect(
        harness.hasher.verify(stored, 'a-brand-new-passphrase'),
      ).resolves.toBe(true);
    });

    it('revokes every session the user had', async () => {
      /* The point of the whole flow. People reset a password precisely when
         they believe someone else has it; leaving the other party's refresh
         token alive would make the reset theatre. */
      const { harness, token } = await requestToken();
      const refresh = new RefreshTokenService(
        harness.refreshTokens,
        harness.tokens,
        makeTestConfig(),
      );
      await refresh.issueForNewSession('user_1');
      await refresh.issueForNewSession('user_1');

      await harness.service.reset(token, 'a-brand-new-passphrase');

      expect(
        harness.refreshTokens.rows.every((row) => row.revokedAt !== null),
      ).toBe(true);
    });

    it('leaves other users signed in', async () => {
      // Revocation is scoped to the account being reset.
      const { harness, token } = await requestToken();
      const refresh = new RefreshTokenService(
        harness.refreshTokens,
        harness.tokens,
        makeTestConfig(),
      );
      await refresh.issueForNewSession('someone_else');

      await harness.service.reset(token, 'a-brand-new-passphrase');

      expect(harness.refreshTokens.rows[0]?.revokedAt).toBeNull();
    });

    it('is single use', async () => {
      const { harness, token } = await requestToken();

      await harness.service.reset(token, 'a-brand-new-passphrase');

      await expect(
        harness.service.reset(token, 'another-long-passphrase'),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
    });

    it('rejects an expired token', async () => {
      const { harness, token } = await requestToken();
      const row = harness.tokenRepo.rows[0];
      if (row !== undefined) row.expiresAt = new Date(Date.now() - 1000);

      await expect(
        harness.service.reset(token, 'a-brand-new-passphrase'),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
    });

    it('rejects an unknown token', async () => {
      const { service, tokens } = makeService();

      await expect(
        service.reset(tokens.generate().plaintext, 'a-brand-new-passphrase'),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
    });

    it('gives the SAME error for unknown, expired, and used tokens', async () => {
      const { harness, token } = await requestToken();
      await harness.service.reset(token, 'a-brand-new-passphrase');

      const messages: string[] = [];
      for (const attempt of [
        token,
        harness.tokens.generate().plaintext,
        'x'.repeat(30),
      ]) {
        await harness.service
          .reset(attempt, 'yet-another-passphrase')
          .catch((error: unknown) => {
            messages.push((error as Error).message);
          });
      }

      expect(messages).toHaveLength(3);
      expect(new Set(messages).size).toBe(1);
    });

    it('does not accept an email-verification token', async () => {
      /* Purpose isolation. Both flows share one table, so without the
         filter a verification link — which is far longer-lived and issued
         far more freely — would double as an account-takeover credential. */
      const { service, tokenRepo, tokens } = makeService();
      const { plaintext, hash } = tokens.generate();

      await tokenRepo.create({
        userId: 'user_1',
        purpose: 'EMAIL_VERIFY',
        tokenHash: hash,
        expiresAt: tokens.expiryFromNow(60),
      });

      await expect(
        service.reset(plaintext, 'a-brand-new-passphrase'),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
    });

    it('leaves the password unchanged when the token is rejected', async () => {
      const { service, userRepo, tokens } = makeService();

      await service
        .reset(tokens.generate().plaintext, 'a-brand-new-passphrase')
        .catch(() => undefined);

      expect(userRepo.rows[0]?.passwordHash).toBe(OLD_HASH);
    });

    it('verifies an unverified address', async () => {
      /* Redeeming the link proves control of the mailbox — the same proof
         email verification asks for. Demanding it twice is friction, not
         security. */
      const harness = makeService([makeUser({ emailVerifiedAt: null })]);
      await harness.service.request('nabila@example.com');
      await flush();
      const token = tokenFromEmail(harness.mailer.sent[0]!);

      await harness.service.reset(token, 'a-brand-new-passphrase');

      expect(harness.userRepo.rows[0]?.emailVerifiedAt).not.toBeNull();
    });
  });
});
