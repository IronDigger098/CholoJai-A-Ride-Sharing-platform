import { ConflictError } from '../../common/errors/domain-error';

/**
 * Authentication domain errors.
 *
 * Each extends a semantic base class that fixes the HTTP status, and adds a
 * stable `code` the frontend switches on (docs/api-design.md §3).
 */

/**
 * The email is already registered.
 *
 * A note on the security trade-off this represents: returning 409 here
 * confirms to an unauthenticated caller that an address has an account,
 * which is user enumeration. We accept it on *registration* because the
 * alternative — pretending to succeed — produces a genuinely broken
 * experience: a user who mistypes an existing address gets a "check your
 * email" screen and a verification mail that never arrives, with no way to
 * understand why.
 *
 * The trade is different on `/auth/forgot-password`, where a generic
 * response costs the user nothing, and there we DO stay silent (M3.7).
 * Enumeration resistance is a per-endpoint judgment, not a blanket rule —
 * and the rate limiting in M3.5 is what stops this endpoint from becoming
 * a bulk address-checking oracle.
 */
export class EmailAlreadyRegisteredError extends ConflictError {
  public readonly code = 'EMAIL_ALREADY_REGISTERED';
  public readonly title = 'Email already registered';

  public constructor() {
    super(
      'An account with this email address already exists. Try signing in instead.',
    );
  }
}
