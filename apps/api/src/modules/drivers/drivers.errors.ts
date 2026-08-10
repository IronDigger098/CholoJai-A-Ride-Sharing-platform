import { ConflictError, NotFoundError } from '../../common/errors/domain-error';

/**
 * This user has already applied.
 *
 * 409 rather than treating a second application as an update. An applicant
 * whose licence details changed needs a decision revisited, not a silent
 * overwrite of a record an administrator may already be reading.
 */
export class AlreadyAppliedError extends ConflictError {
  public readonly code = 'ALREADY_APPLIED';
  public readonly title = 'You have already applied';

  public constructor() {
    super(
      'You have already applied to drive. Check the status of your ' +
        'existing application.',
    );
  }
}

export class DriverProfileNotFoundError extends NotFoundError {
  public readonly code = 'DRIVER_PROFILE_NOT_FOUND';
  public readonly title = 'Driver application not found';

  public constructor(id: string) {
    super(`No driver application exists with id ${id}.`);
  }
}

/**
 * The application has already been approved or rejected.
 *
 * 409, and reachable in ordinary use: two administrators working the same
 * queue, or one double-clicking. The decision that landed first stands,
 * because a rejection silently overwriting an approval is worse than an
 * error message.
 */
export class ApplicationAlreadyDecidedError extends ConflictError {
  public readonly code = 'APPLICATION_ALREADY_DECIDED';
  public readonly title = 'That application has already been decided';

  public constructor() {
    super(
      'This application is no longer pending — someone has already ' +
        'approved or rejected it.',
    );
  }
}
