import {
  ConflictError,
  UnauthenticatedError,
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

/**
 * The email/password pair did not authenticate.
 *
 * One error for both halves, always. "No account with that email" and
 * "wrong password" are two different sentences that together let anyone
 * with a wordlist discover which of a million addresses hold accounts —
 * and an address that has an account here is, by itself, information about
 * a person: where they live, that they travel, that they drive for a living.
 *
 * The equivalent leak through *timing* is handled in `AuthService.login`,
 * which hashes a decoy password when no user is found. A vague message in
 * front of a stopwatch-shaped hole would be theatre.
 *
 * Unlike registration, hiding the distinction costs the legitimate user
 * almost nothing: their next action — check the address, try the password
 * again, reset it — is the same either way.
 */
export class InvalidCredentialsError extends UnauthenticatedError {
  public readonly code = 'INVALID_CREDENTIALS';
  public readonly title = 'Sign-in failed';

  public constructor() {
    super('The email address or password is incorrect.');
  }
}

/**
 * The access token is missing, malformed, or does not verify.
 *
 * Distinct from {@link AccessTokenExpiredError} because the client's
 * correct reaction differs: this one means sign in again.
 */
export class InvalidAccessTokenError extends UnauthenticatedError {
  public readonly code = 'INVALID_ACCESS_TOKEN';
  public readonly title = 'Not signed in';

  public constructor() {
    super('Your session is not valid. Please sign in again.');
  }
}

/**
 * The access token was ours and correctly signed, but has expired.
 *
 * Its own code so the client can tell "refresh silently" from "send the
 * user back to the sign-in screen". Without the distinction every expiry —
 * one every fifteen minutes, per user — looks like a session failure and
 * the app logs people out constantly.
 *
 * This reveals nothing: whoever sends the token already holds it.
 */
export class AccessTokenExpiredError extends UnauthenticatedError {
  public readonly code = 'ACCESS_TOKEN_EXPIRED';
  public readonly title = 'Session expired';

  public constructor() {
    super('Your session has expired. Refresh it or sign in again.');
  }
}
