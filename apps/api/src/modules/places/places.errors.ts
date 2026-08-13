import { MAX_SAVED_PLACES } from '@cholojai/shared';

import { ConflictError, NotFoundError } from '../../common/errors/domain-error';

export class SavedPlaceNotFoundError extends NotFoundError {
  public readonly code = 'SAVED_PLACE_NOT_FOUND';
  public readonly title = 'No such place';

  public constructor() {
    /* Deliberately says nothing about whose it was. A place belonging to
       somebody else answers exactly this, so a probe cannot use the
       difference to discover which ids exist. */
    super('That saved place no longer exists.');
  }
}

/**
 * The shortlist is full.
 *
 * A limit rather than none, because this table is written by an
 * authenticated caller with no other ceiling on it — and a rider with ten
 * thousand saved places is either a bug or somebody using the account as
 * storage. Twenty is well past what anyone needs and low enough to matter.
 */
export class TooManySavedPlacesError extends ConflictError {
  public readonly code = 'TOO_MANY_SAVED_PLACES';
  public readonly title = 'Your saved places are full';

  public constructor() {
    super(
      `You can save up to ${String(MAX_SAVED_PLACES)} places. ` +
        'Remove one you no longer use to make room.',
    );
  }
}
