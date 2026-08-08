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

/**
 * The refresh cookie is missing, unknown, expired, or already dead.
 *
 * The end of the road: the client must send the user to sign in. One code
 * covers all four because the remedy is identical, and because
 * distinguishing "no such token" from "expired token" would let someone
 * feeding us guesses learn when they had struck a real one.
 */
export class RefreshTokenInvalidError extends UnauthenticatedError {
  public readonly code = 'REFRESH_TOKEN_INVALID';
  public readonly title = 'Session ended';

  public constructor() {
    super('Your session is no longer valid. Please sign in again.');
  }
}

/**
 * This token was rotated moments ago by a concurrent request.
 *
 * Not an attack and not the user's fault: two tabs, or a mobile client
 * retrying through a dead spot, genuinely send the same token twice. The
 * request that arrived first already returned a new cookie, so the correct
 * client behaviour is to retry once — which is why this needs its own code
 * rather than looking like a dead session.
 *
 * Nothing is revoked. Treating this as theft would sign people out for
 * having a bad connection, which is how a security control turns into a
 * feature users route around.
 */
export class RefreshTokenStaleError extends UnauthenticatedError {
  public readonly code = 'REFRESH_TOKEN_STALE';
  public readonly title = 'Session refresh raced';

  public constructor() {
    super('This session was refreshed by another request. Try again.');
  }
}

/**
 * A rotated refresh token came back. Someone has a copy.
 *
 * Rotation means each token is used exactly once, so a token presented
 * after it was already exchanged should not exist anywhere. Either an
 * attacker is replaying one the user has since rotated past, or the user
 * is replaying one the attacker rotated first. We cannot tell which, so
 * the entire family is revoked and both parties are signed out. Only the
 * one who knows the password comes back.
 *
 * Its own code, deliberately, so the client can say "you were signed out
 * for your security" instead of a generic failure. That discloses nothing:
 * whoever receives this already holds the token, and telling an attacker
 * they were caught does not help them — the family is already dead.
 */
export class RefreshTokenReusedError extends UnauthenticatedError {
  public readonly code = 'REFRESH_TOKEN_REUSED';
  public readonly title = 'Session revoked for security';

  public constructor() {
    super(
      'This session was ended because a sign-in credential was reused. ' +
        'Please sign in again.',
    );
  }
}

/**
 * The password-reset token is unknown, expired, or already used.
 *
 * One code for all three, like its verification counterpart. The additional
 * reason here is that a reset token is an account-takeover credential, so
 * an endpoint that says "expired" rather than "no such token" tells someone
 * feeding it guesses that they have found a live account and merely need to
 * be quicker next time.
 *
 * 422 rather than 400: the request is well formed and the token is a
 * plausible string. It simply cannot be acted upon.
 */
export class InvalidPasswordResetTokenError extends UnprocessableError {
  public readonly code = 'INVALID_PASSWORD_RESET_TOKEN';
  public readonly title = 'Reset link is not valid';

  public constructor() {
    super(
      'This password reset link is invalid or has expired. Request a new one.',
    );
  }
}
