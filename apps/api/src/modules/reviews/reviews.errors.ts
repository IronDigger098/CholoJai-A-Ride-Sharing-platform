import { type RideStatus } from '@cholojai/shared';

import { ConflictError } from '../../common/errors/domain-error';

/**
 * The journey has not finished.
 *
 * 409 rather than 403 or 422: the caller is permitted and the request is
 * well-formed, it conflicts with where the ride currently is. The status is
 * named because "you cannot rate this" tells a rider nothing they can act
 * on, while "a ride that is IN_PROGRESS cannot be rated" tells them to wait.
 */
export class RideNotFinishedError extends ConflictError {
  public readonly code = 'RIDE_NOT_FINISHED';
  public readonly title = 'That journey has not finished';

  /* Named `rideStatus`, not `status`. `DomainError` already carries a
     `status` — the HTTP one — and a parameter property of the same name
     silently shadows it with a `RideStatus`, which is how a 409 becomes a
     response with `status: "IN_PROGRESS"` in it. */
  public constructor(public readonly rideStatus: RideStatus) {
    super(
      `A ride that is ${rideStatus} cannot be rated. Ratings are for ` +
        'journeys that finished.',
    );
  }
}

/**
 * A ride that never had a driver.
 *
 * Reachable for a ride that was cancelled before anyone accepted it, or one
 * that expired. Separate from `RIDE_NOT_FINISHED` because the two lead
 * somewhere different: one is worth waiting for, the other never will be.
 */
export class NobodyToRateError extends ConflictError {
  public readonly code = 'NOBODY_TO_RATE';
  public readonly title = 'That ride had no driver';

  public constructor() {
    super('No driver ever took this ride, so there is nobody to rate.');
  }
}

/**
 * One rating per person per ride.
 *
 * Enforced by the `(ride_id, author_id)` unique index rather than by a read
 * in this service. Two taps on a slow connection would both pass a
 * read-then-write check and leave the driver's average counting one journey
 * twice.
 */
export class AlreadyRatedError extends ConflictError {
  public readonly code = 'ALREADY_RATED';
  public readonly title = 'You already rated this ride';

  public constructor() {
    super('A ride can be rated once, and this one already has been.');
  }
}
