/**
 * Persistence for single-use verification and password-reset tokens.
 *
 * A port, so the flows that consume tokens stay testable against an
 * in-memory fake. The Prisma adapter is the only thing that knows these
 * rows live in `verification_tokens`.
 */

export type VerificationPurpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

export interface VerificationTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly purpose: VerificationPurpose;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export interface CreateVerificationTokenInput {
  readonly userId: string;
  readonly purpose: VerificationPurpose;
  /** SHA-256 of the token. The plaintext is emailed and never stored. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface VerificationTokenRepository {
  create(input: CreateVerificationTokenInput): Promise<void>;

  /**
   * Look a token up by its hash.
   *
   * By hash, never by user: the presented token is the credential, and
   * searching for "this user's latest token" would let anyone holding a
   * user id skip the proof entirely.
   */
  findByHash(
    tokenHash: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationTokenRecord | null>;

  /**
   * Mark a token used. Returns false if it was already consumed.
   *
   * The boolean is the single-use guarantee. Two requests arriving with the
   * same valid token race here, and the loser gets `false` — the database's
   * conditional update decides, not application code that checked a moment
   * earlier.
   */
  consume(tokenId: string): Promise<boolean>;

  /**
   * Invalidate every outstanding token of a purpose for a user.
   *
   * Called when a new one is issued, so requesting a second verification
   * email silently retires the first. Without this, every link ever sent
   * stays live until it expires — a widening window of valid credentials
   * sitting in old inboxes.
   */
  revokeAllForUser(userId: string, purpose: VerificationPurpose): Promise<void>;
}

export const VERIFICATION_TOKEN_REPOSITORY = Symbol(
  'VERIFICATION_TOKEN_REPOSITORY',
);
