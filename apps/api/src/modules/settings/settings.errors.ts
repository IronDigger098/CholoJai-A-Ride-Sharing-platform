import {
  ConflictError,
  UnprocessableError,
} from '../../common/errors/domain-error';

/**
 * The current password did not match.
 *
 * Deliberately not a 401. The caller *is* authenticated — their token is
 * valid — and answering 401 would tell a client whose refresh logic keys
 * off that status to go and refresh, which would succeed and change
 * nothing. This is a rejected field on a form, not a rejected session.
 */
export class CurrentPasswordIncorrectError extends UnprocessableError {
  public readonly code = 'CURRENT_PASSWORD_INCORRECT';
  public readonly title = 'That password is not right';

  public constructor() {
    super('The current password you entered does not match our records.');
  }
}

/** Somebody else already uses that number. */
export class PhoneTakenError extends ConflictError {
  public readonly code = 'PHONE_TAKEN';
  public readonly title = 'That number is already in use';

  public constructor() {
    super('Another account is already using that phone number.');
  }
}
