/**
 * What the authentication flow needs from refresh-token persistence.
 *
 * Every method exists because a specific use case calls it. `rotate` and
 * `familyStartedAt` arrived with M3.5 when rotation gave them callers —
 * not in M3.4 on speculation about what rotation might need.
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

/** A rotation: retire one token and mint its successor, together. */
export interface RotateRefreshTokenInput {
  readonly currentId: string;
  readonly successor: CreateRefreshTokenInput;
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

  /**
   * Revoke every live token belonging to a user, across all families.
   *
   * The blunt instrument, and there is exactly one caller: a completed
   * password reset. Someone resetting because they believe they were
   * compromised expects every other session to end, and revoking one family
   * would leave the attacker's device signed in on another.
   */
  revokeAllForUser(userId: string): Promise<number>;

  /**
   * Retire a token and issue its successor, atomically.
   *
   * Returns `null` when the token was already revoked — meaning a
   * concurrent request rotated it first. That return value is the entire
   * concurrency contract: two requests carrying the same token produce
   * exactly one successor, and the loser is told so rather than quietly
   * minting a second live token in the same family.
   *
   * Implementations must perform the check and the write in one atomic
   * step. A read followed by a write lets both callers pass the check
   * before either commits.
   */
  rotate(input: RotateRefreshTokenInput): Promise<RefreshTokenRecord | null>;

  /**
   * When the oldest token in a family was created — i.e. when the user
   * signed in.
   *
   * This is what bounds a session absolutely. Each successor's expiry is
   * clamped to this instant plus the absolute TTL, so rotation slides the
   * window forward without ever pushing it past the original sign-in's
   * ceiling. Returns `null` for an unknown family.
   */
  familyStartedAt(familyId: string): Promise<Date | null>;
}

/** Injection token — an interface has no runtime value to key DI on. */
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
