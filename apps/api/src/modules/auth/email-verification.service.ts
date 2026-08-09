import { Inject, Injectable, Logger } from '@nestjs/common';

import { MAILER, type Mailer } from '../../common/mail/mailer.port';
import { TokenService } from '../../common/security/token.service';
import { AppConfigService } from '../../config/app-config.service';
import {
  USER_REPOSITORY,
  type UserRecord,
  type UserRepository,
} from '../users/user-repository.port';

import { buildVerificationEmail } from './auth-email.templates';
import {
  EmailAlreadyVerifiedError,
  InvalidVerificationTokenError,
} from './auth.errors';
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from './verification-token-repository.port';

/**
 * How long a verification link stays valid.
 *
 * 24 hours balances two failure modes: too short and someone who checks
 * email once a day is permanently locked out; too long and a link sitting
 * in an abandoned inbox stays a live credential for weeks. Resending is
 * cheap, so erring short is the safer side.
 */
const VERIFICATION_TTL_HOURS = 24;

/**
 * Issues and consumes email-verification links.
 *
 * Split out of `AuthService` because it is a self-contained flow with its
 * own collaborators — a token store, a mailer, and templates — and folding
 * it in would make `AuthService` a class that does registration *and* login
 * *and* verification *and* password reset. Single responsibility applies to
 * classes, not just functions.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  public constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokenStore: VerificationTokenRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Issue a fresh link and email it.
   *
   * Any outstanding token is revoked first. Without that, every link ever
   * sent stays valid until it expires, so requesting three emails leaves
   * three live credentials scattered across an inbox. One outstanding token
   * at a time is the smaller attack surface and matches what users expect —
   * the newest link is the one that works.
   */
  public async sendVerificationEmail(user: UserRecord): Promise<void> {
    if (user.emailVerifiedAt !== null) {
      throw new EmailAlreadyVerifiedError();
    }

    await this.tokenStore.revokeAllForUser(user.id, 'EMAIL_VERIFY');

    const { plaintext, hash } = this.tokens.generate();

    await this.tokenStore.create({
      userId: user.id,
      purpose: 'EMAIL_VERIFY',
      tokenHash: hash,
      expiresAt: this.tokens.expiryFromNow(VERIFICATION_TTL_HOURS * 60),
    });

    /* The link points at the WEB app, not the API. The page there reads the
       token from its own query string and POSTs it to us — so the token
       never travels as an API query parameter, where it would land in
       access logs and Referer headers. */
    const verifyUrl = `${this.config.webBaseUrl}/verify-email?token=${encodeURIComponent(plaintext)}`;

    await this.mailer.send(
      buildVerificationEmail(user.email, {
        fullName: user.fullName,
        verifyUrl,
        expiresInHours: VERIFICATION_TTL_HOURS,
      }),
    );

    // The user id, never the token. A log line holding a live credential is
    // the thing this whole design exists to avoid.
    this.logger.log(`Issued verification link for user ${user.id}`);
  }

  /**
   * Consume a token and mark the address verified.
   *
   * Every failure — unknown token, expired token, already-consumed token —
   * raises the same error. Distinguishing them would confirm to someone
   * guessing tokens that they had found a real one.
   */
  public async verify(plaintextToken: string): Promise<UserRecord> {
    const hash = this.tokens.hash(plaintextToken);
    const record = await this.tokenStore.findByHash(hash, 'EMAIL_VERIFY');

    if (record === null) throw new InvalidVerificationTokenError();
    if (record.consumedAt !== null) throw new InvalidVerificationTokenError();
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new InvalidVerificationTokenError();
    }

    /* Consume before verifying. The repository's conditional update is what
       makes this single-use: two requests carrying the same token race
       here, and exactly one wins. Checking `consumedAt` above is for the
       clear error path; this is the guarantee. */
    const consumed = await this.tokenStore.consume(record.id);
    if (!consumed) throw new InvalidVerificationTokenError();

    await this.users.markEmailVerified(record.userId);

    const user = await this.users.findById(record.userId);
    if (user === null) {
      // A valid token pointing at a missing user means the account was
      // deleted between issue and click. Same opaque error — the caller
      // learns nothing either way.
      throw new InvalidVerificationTokenError();
    }

    this.logger.log(`Verified email for user ${user.id}`);
    return user;
  }

  /**
   * Resend a verification link.
   *
   * Returns silently whether or not the address exists, and whether or not
   * it is already verified. Unlike registration — where a clear 409 saves
   * the user from a broken flow — there is no legitimate benefit to the
   * caller in knowing, and answering honestly would turn this endpoint into
   * a bulk address-checking oracle. The user's next step is the same in
   * every case: check the inbox.
   */
  public async resend(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);

    /* Two separate checks rather than one combined condition. The linter
       would accept `user?.emailVerifiedAt !== null`, which is equivalent
       only because `undefined !== null` — correct but subtle enough that a
       reader has to stop and work it out. Security-relevant control flow
       should be obvious on first reading. */
    if (user === null) {
      this.logger.log('Resend requested for an unknown address');
      return;
    }

    if (user.emailVerifiedAt !== null) {
      this.logger.log(`Resend requested for already-verified user ${user.id}`);
      return;
    }

    await this.sendVerificationEmail(user);
  }
}
