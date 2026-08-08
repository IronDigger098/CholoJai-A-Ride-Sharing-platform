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
 * What happened when a token was presented for rotation.
 *
 * Four outcomes, and the caller must handle each differently — which is
 * exactly why this is a union rather than a token-or-null. Collapsing
 * `stale` into `reused` signs honest users out; collapsing `reused` into
 * `invalid` throws away the theft signal that the whole mechanism exists
 * to produce.
 */
export type RotationOutcome =
  | {
      readonly status: 'rotated';
      readonly userId: string;
      readonly familyId: string;
      readonly plaintext: string;
    }
  /** Unknown, expired, or revoked without ever having been rotated. */
  | { readonly status: 'invalid' }
  /** Rotated moments ago — a concurrent request won. Retry, do not panic. */
  | { readonly status: 'stale' }
  /** Rotated long enough ago that a copy is loose. The family is now dead. */
  | { readonly status: 'reused'; readonly userId: string };

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
    const now = new Date();

    const { plaintext, hash } = this.tokens.generate();

    const record = await this.store.create({
      userId,
      tokenHash: hash,
      familyId: randomUUID(),
      expiresAt: this.expiryFor(now, now),
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

  /**
   * End every session a user has.
   *
   * Called after a password reset. The access tokens already issued survive
   * until they expire — nothing short of a denylist can recall a JWT — so
   * the honest description is that this closes the long-lived door
   * immediately and the short-lived one within the access-token lifetime.
   */
  public async revokeAllSessions(userId: string): Promise<number> {
    const revoked = await this.store.revokeAllForUser(userId);
    this.logger.warn(`Revoked all ${revoked} session token(s) for ${userId}`);
    return revoked;
  }

  /** End a session by family, for callers that already know which one. */
  public async revokeFamily(familyId: string): Promise<number> {
    return this.store.revokeFamily(familyId);
  }

  /**
   * Exchange a refresh token for its successor.
   *
   * The security-relevant part of this whole milestone. Read the four
   * outcomes in {@link RotationOutcome} first; this method is just the
   * decision tree that produces them.
   */
  public async rotate(plaintext: string): Promise<RotationOutcome> {
    const record = await this.store.findByHash(this.tokens.hash(plaintext));

    if (record === null) return { status: 'invalid' };

    if (record.revokedAt !== null) {
      return this.classifyReplay(record, record.revokedAt);
    }

    if (record.expiresAt.getTime() <= Date.now()) return { status: 'invalid' };

    const familyStart = await this.store.familyStartedAt(record.familyId);
    if (familyStart === null) return { status: 'invalid' };

    const expiresAt = this.expiryFor(new Date(), familyStart);

    /* The family has outlived its absolute ceiling. Nothing to issue: any
       successor would already be expired, so the honest answer is that
       this session is over and the password is required. */
    if (expiresAt.getTime() <= Date.now()) return { status: 'invalid' };

    const { plaintext: successorPlaintext, hash } = this.tokens.generate();

    const successor = await this.store.rotate({
      currentId: record.id,
      successor: {
        userId: record.userId,
        tokenHash: hash,
        familyId: record.familyId,
        expiresAt,
      },
    });

    if (successor === null) {
      /* Another request rotated this token between our read and our write.
         Re-read and classify it exactly as any other replay would be — so
         a zero-length grace window means zero-length here too, rather than
         this path quietly being more forgiving than the configured policy. */
      const rotated = await this.store.findByHash(this.tokens.hash(plaintext));

      if (rotated?.revokedAt == null) return { status: 'invalid' };

      return this.classifyReplay(rotated, rotated.revokedAt);
    }

    this.logger.log(`Rotated refresh token for user ${record.userId}`);

    return {
      status: 'rotated',
      userId: record.userId,
      familyId: record.familyId,
      plaintext: successorPlaintext,
    };
  }

  /**
   * Decide what a revoked token being presented actually means.
   *
   * Three cases, and the distinction between them is the difference
   * between a security control and a nuisance.
   */
  private async classifyReplay(
    record: RefreshTokenRecord,
    revokedAt: Date,
  ): Promise<RotationOutcome> {
    /* Revoked but never rotated: killed by a sign-out, or swept up in an
       earlier family revocation. Replaying it is not evidence of anything —
       a client retrying its last request after the user hit sign-out looks
       exactly like this. Rejecting quietly is correct; raising the alarm
       here would make every sign-out log a fake theft. */
    if (record.replacedById === null) return { status: 'invalid' };

    const sinceRotation = Date.now() - revokedAt.getTime();

    /* Strictly less than, not `<=`. The window is half-open so that a
       configured grace of zero actually means zero — with `<=`, a replay
       arriving in the same millisecond as the rotation would still be
       forgiven, and "strict mode" would quietly have a one-millisecond
       hole in it. */
    if (sinceRotation < this.config.refreshPolicy.rotationGraceMs) {
      /* Rotated a moment ago. Two tabs, or a retry through a tunnel. The
         winning response already carried the new cookie, so the client can
         simply try again. Nothing is revoked. */
      this.logger.log(
        `Stale refresh token replayed ${sinceRotation}ms after rotation`,
      );
      return { status: 'stale' };
    }

    /* A token that was rotated, presented again long after the fact. The
       legitimate holder moved on to the successor, so whoever sent this
       kept a copy — and we cannot tell which party is which. Revoking the
       family logs out both, and only the one who knows the password
       returns. */
    const revoked = await this.store.revokeFamily(record.familyId);

    this.logger.warn(
      `Refresh token reuse detected for user ${record.userId} ` +
        `(${sinceRotation}ms after rotation); revoked ${revoked} token(s)`,
    );

    return { status: 'reused', userId: record.userId };
  }

  /**
   * When a token issued now should expire.
   *
   * The sliding window, clamped to the family's absolute ceiling. Without
   * the clamp, rotation would make a session immortal: refresh once a week
   * and it never ends. `Math.min` on the two instants is the whole policy.
   */
  private expiryFor(now: Date, familyStartedAt: Date): Date {
    const { slidingTtlMs, absoluteTtlMs } = this.config.refreshPolicy;

    return new Date(
      Math.min(
        now.getTime() + slidingTtlMs,
        familyStartedAt.getTime() + absoluteTtlMs,
      ),
    );
  }
}
