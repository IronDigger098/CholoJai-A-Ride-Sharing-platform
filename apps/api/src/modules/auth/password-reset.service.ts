import { Inject, Injectable, Logger } from '@nestjs/common';

import { MAILER, type Mailer } from '../../common/mail/mailer.port';
import { PasswordHasherService } from '../../common/security/password-hasher.service';
import { TokenService } from '../../common/security/token.service';
import { AppConfigService } from '../../config/app-config.service';
import {
  USER_REPOSITORY,
  type UserRecord,
  type UserRepository,
} from '../users/user-repository.port';

import { buildPasswordResetEmail } from './auth-email.templates';
import { InvalidPasswordResetTokenError } from './auth.errors';
import { RefreshTokenService } from './refresh-token.service';
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from './verification-token-repository.port';

/**
 * How long a reset link stays valid.
 *
 * One hour, against twenty-four for email verification, and the asymmetry
 * is the point. A verification link only ever activates an account someone
 * just created; a reset link *takes over* an existing one. Anyone who
 * reaches the mailbox later — a shared laptop, a synced tablet, a stolen
 * phone, a mail archive — holds an account takeover for as long as this
 * number says. Requesting another costs one click.
 */
const RESET_TTL_MINUTES = 60;

/**
 * Forgotten-password recovery.
 *
 * The flow that most tempts an implementer into leaking information, so the
 * rules are worth stating before the code.
 *
 * **Requesting a reset never reveals whether the address exists.** Always
 * 204, always the same shape. This is the endpoint where the trade-off runs
 * the opposite way from registration: a 409 on sign-up saves a user from a
 * broken flow and is worth the disclosure, whereas here the caller's next
 * step — check your inbox — is identical either way, so honesty buys them
 * nothing and buys an attacker a bulk address-checking oracle.
 *
 * **The mail is sent without blocking the response.** Not a performance
 * tweak: a generic message in front of a measurable timing difference is
 * decoration. If a known address waits for SMTP and an unknown one returns
 * immediately, the two are trivially distinguishable with a stopwatch and
 * the identical response body is worth nothing. This mirrors the decoy hash
 * on login.
 *
 * **A completed reset ends every session.** People reset their password
 * precisely when they believe someone else has it. Leaving the attacker's
 * refresh token alive would make the reset theatre.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  public constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokenStore: VerificationTokenRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly tokens: TokenService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Begin a reset.
   *
   * Returns as soon as the token is stored, before the mail is delivered.
   * Every path through this method costs about the same, whether or not the
   * address belongs to anyone.
   */
  public async request(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);

    if (user === null) {
      this.logger.log('Password reset requested for an unknown address');
      return;
    }

    /* Any outstanding reset token is revoked first. Without this, every
       link ever requested stays live for an hour, so a user who clicks
       "forgot password" three times leaves three working account-takeover
       credentials scattered through their inbox. */
    await this.tokenStore.revokeAllForUser(user.id, 'PASSWORD_RESET');

    const { plaintext, hash } = this.tokens.generate();

    await this.tokenStore.create({
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      tokenHash: hash,
      expiresAt: this.tokens.expiryFromNow(RESET_TTL_MINUTES),
    });

    /* Deliberately not awaited — see the timing argument in the class
       comment. The failure is logged rather than surfaced: the caller was
       already told nothing, and there is no honest way to report "we could
       not email an address we will not confirm exists". */
    void this.deliver(user, plaintext);

    this.logger.log(`Issued a password reset token for user ${user.id}`);
  }

  /**
   * Complete a reset.
   *
   * Ordering matters. The token is consumed before the password changes, so
   * two requests racing with the same link produce exactly one password
   * change; and sessions are revoked after, so a failure mid-way leaves the
   * user with their old password and their old sessions rather than neither.
   */
  public async reset(
    plaintextToken: string,
    newPassword: string,
  ): Promise<void> {
    const hash = this.tokens.hash(plaintextToken);
    const record = await this.tokenStore.findByHash(hash, 'PASSWORD_RESET');

    /* One error for unknown, expired, and already-used. Distinguishing them
       would confirm to someone guessing tokens that they had found a real
       one — and the purpose filter above is what stops an email-verification
       token being redeemed here as a password reset. */
    if (record === null) throw new InvalidPasswordResetTokenError();
    if (record.consumedAt !== null) throw new InvalidPasswordResetTokenError();
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new InvalidPasswordResetTokenError();
    }

    const consumed = await this.tokenStore.consume(record.id);
    if (!consumed) throw new InvalidPasswordResetTokenError();

    const user = await this.users.findById(record.userId);
    if (user === null) throw new InvalidPasswordResetTokenError();

    await this.users.updatePasswordHash(
      user.id,
      await this.passwordHasher.hash(newPassword),
    );

    /* Redeeming the link proves control of the mailbox — the same proof
       email verification asks for. Making someone verify separately after
       demonstrating it would be asking twice for one fact. */
    if (user.emailVerifiedAt === null) {
      await this.users.markEmailVerified(user.id);
      this.logger.log(`Verified user ${user.id} via a password reset`);
    }

    await this.refreshTokens.revokeAllSessions(user.id);

    this.logger.warn(
      `Password reset completed for user ${user.id}; all sessions revoked`,
    );
  }

  /** Send the mail, swallowing failures so the caller's timing is stable. */
  private async deliver(user: UserRecord, plaintext: string): Promise<void> {
    /* The link points at the web app, which reads the token from its own
       query string and POSTs it back. A token in an API query parameter
       would land in access logs and in the Referer header of every
       third-party asset the page loads. */
    const resetUrl = `${this.config.webBaseUrl}/reset-password?token=${encodeURIComponent(plaintext)}`;

    try {
      await this.mailer.send(
        buildPasswordResetEmail(user.email, {
          fullName: user.fullName,
          resetUrl,
          expiresInMinutes: RESET_TTL_MINUTES,
        }),
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send a password reset email to user ${user.id}`,
        error,
      );
    }
  }
}
