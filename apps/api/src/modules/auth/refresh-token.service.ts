import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { TokenService } from '../../common/security/token.service';
import { AppConfigService } from '../../config/app-config.service';

import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenRecord,
  type RefreshTokenRepository,
} from './refresh-token-repository.port';

/** A newly minted token: the plaintext for the cookie, the row for us. */
export interface IssuedRefreshToken {
  readonly plaintext: string;
  readonly record: RefreshTokenRecord;
}

/**
 * Issues and revokes refresh tokens.
 *
 * **Why these are opaque random strings and not JWTs.**
 *
 * The obvious symmetry — access tokens are JWTs, so refresh tokens should
 * be too — is wrong, and worth spelling out because it is a decision a
 * reviewer will ask about.
 *
 * A JWT's single advantage is that it can be validated without touching a
 * database: the signature carries the proof. That advantage exists only if
 * you actually skip the lookup. A refresh token *cannot* skip it. It must
 * be revocable on sign-out, on password change, and on detected theft, and
 * revocation means consulting a store on every use. Once the database read
 * is unavoidable, the signature is doing no work — it is ceremony that adds
 * a second signing key to protect, a second set of clock-skew rules, and a
 * larger cookie.
 *
 * So the refresh token is 256 bits from the OS CSPRNG, stored as a SHA-256
 * hash, and looked up by that hash. The database row *is* the token's
 * validity. This is also what Auth0, Okta, and the OAuth 2.0 Security BCP
 * do, for the same reason.
 *
 * The trade we accept: an unauthenticated caller can force one indexed
 * lookup per garbage string. Rate limiting on `/auth/refresh` (M3.6) is the
 * answer to that, not a signature.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  public constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly store: RefreshTokenRepository,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Start a new session.
   *
   * A fresh `familyId` per sign-in is what keeps sessions independent:
   * revoking the family a stolen token belongs to signs out that device
   * without touching the user's phone, laptop, or anything else.
   */
  public async issueForNewSession(userId: string): Promise<IssuedRefreshToken> {
    return this.issue(userId, randomUUID());
  }

  /**
   * Mint a token inside an existing family.
   *
   * Public because rotation (M3.5) continues a family rather than starting
   * one — that continuity is precisely what makes reuse detectable.
   */
  public async issue(
    userId: string,
    familyId: string,
  ): Promise<IssuedRefreshToken> {
    const { plaintext, hash } = this.tokens.generate();

    const record = await this.store.create({
      userId,
      tokenHash: hash,
      familyId,
      expiresAt: this.tokens.expiryFromNow(this.config.refreshTokenTtlMinutes),
    });

    return { plaintext, record };
  }

  /**
   * End the session a token belongs to.
   *
   * Returns quietly when the token is unknown or already revoked. Sign-out
   * has exactly one correct outcome from the caller's point of view — they
   * are signed out — and an error here would only tell someone probing with
   * stolen cookies which of them were real.
   */
  public async revokeSession(plaintext: string): Promise<void> {
    const record = await this.store.findByHash(this.tokens.hash(plaintext));

    if (record === null) {
      this.logger.log('Sign-out presented an unrecognised refresh token');
      return;
    }

    const revoked = await this.store.revokeFamily(record.familyId);
    this.logger.log(
      `Signed out user ${record.userId}: revoked ${revoked} token(s) in family`,
    );
  }
}
