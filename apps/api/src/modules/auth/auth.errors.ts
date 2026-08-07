import {
  ConflictError,
  UnprocessableError,
} from '../../common/errors/domain-error';

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

/**
 * The verification token is unknown, expired, or already used.
 *
 * All three failures share one message and one code, deliberately.
 * Distinguishing "expired" from "never existed" would tell an attacker
 * probing random tokens that they had found a real one — turning a
 * meaningless 422 into a signal. The legitimate user's next step is
 * identical in every case: request a fresh link.
 *
 * 422 rather than 400: the request is well-formed and the token is a
 * plausible string. It simply cannot be acted upon.
 */
export class InvalidVerificationTokenError extends UnprocessableError {
  public readonly code = 'INVALID_VERIFICATION_TOKEN';
  public readonly title = 'Verification link is not valid';

  public constructor() {
    super(
      'This verification link is invalid or has expired. Request a new one to continue.',
    );
  }
}

/**
 * The address is already verified.
 *
 * Not an error the user caused — usually a second click on the same link,
 * or a link opened after verifying on another device. 409 tells the client
 * to route them onward to sign-in rather than showing a failure.
 */
export class EmailAlreadyVerifiedError extends ConflictError {
  public readonly code = 'EMAIL_ALREADY_VERIFIED';
  public readonly title = 'Email already verified';

  public constructor() {
    super('This email address is already verified. You can sign in.');
  }
}
