import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/domain-error';

/**
 * The caller holds the DRIVER role but has no approved application.
 *
 * 403, and it exists because the role and the profile are granted by two
 * writes that can land apart — see `DriversService.approve`. The role alone
 * opens nothing, and this is what enforces that: every driver endpoint
 * resolves an approved profile rather than trusting the token's claim.
 */
export class DriverNotApprovedError extends ForbiddenError {
  public readonly code = 'DRIVER_NOT_APPROVED';
  public readonly title = 'Your application is not approved';

  public constructor() {
    super('You need an approved driver application before you can do this.');
  }
}

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
