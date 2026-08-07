/**
 * What the authentication flow needs from refresh-token persistence.
 *
 * The methods here are exactly the ones M3.4 uses. Rotation and reuse
 * detection (M3.5) will add `markReplaced` and a lookup by family — added
 * then, when there is a caller, rather than now on speculation.
 */

/** A stored refresh token as the domain sees it. Never the plaintext. */
export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  /**
   * Groups every token descended from one sign-in.
   *
   * Rotation replaces a token with its successor, and all of them share a
   * family. That is what makes reuse detection possible in M3.5: presenting
   * an already-rotated token means someone holds a copy, and the response
   * is to revoke the entire family — every descendant of that sign-in —
   * rather than the one row.
   */
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedById: string | null;
}

export interface CreateRefreshTokenInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;

  /**
   * Look a token up by the hash of its plaintext.
   *
   * Returns revoked and expired rows too. The caller decides what to do
   * with them — and in M3.5 the difference matters enormously: a *revoked*
   * token being presented is the signal that a theft has occurred, so
   * hiding those rows here would hide the attack.
   */
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;

  /**
   * Revoke every unrevoked token in a family.
   *
   * The unit of revocation is the session, not the token. Signing out
   * should end the sign-in, and a token whose successor is still live is
   * still a way back in.
   */
  revokeFamily(familyId: string): Promise<number>;
}

/** Injection token — an interface has no runtime value to key DI on. */
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
