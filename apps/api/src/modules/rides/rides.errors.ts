import { type VehicleType } from '@cholojai/shared';

import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/domain-error';

/** No quote with that id was ever issued. */
export class QuoteNotFoundError extends NotFoundError {
  public readonly code = 'QUOTE_NOT_FOUND';
  public readonly title = 'Quote not found';

  public constructor(quoteId: string) {
    super(`No fare quote exists with id ${quoteId}.`);
  }
}

/**
 * The quote existed and has run out.
 *
 * Deliberately distinct from `QUOTE_NOT_FOUND`, which is why the repository
 * returns expired rows instead of hiding them. A client that receives 404
 * has no idea whether to re-quote or to report a bug; one that receives
 * `QUOTE_EXPIRED` knows to price the same journey again, and can say so.
 */
export class QuoteExpiredError extends UnprocessableError {
  public readonly code = 'QUOTE_EXPIRED';
  public readonly title = 'Quote expired';

  public constructor() {
    super('That price is no longer valid. Please get a new quote.');
  }
}

/**
 * The quote is valid but was never priced for that vehicle type.
 *
 * Only reachable from a client sending a type the server did not offer —
 * which is exactly the case worth refusing, because the alternative is
 * pricing it now, at booking time, from rules nobody agreed to.
 */
export class VehicleTypeNotQuotedError extends UnprocessableError {
  public readonly code = 'VEHICLE_TYPE_NOT_QUOTED';
  public readonly title = 'That vehicle was not quoted';

  public constructor(vehicleType: VehicleType) {
    super(`This quote does not include a price for ${vehicleType}.`);
  }
}

/**
 * The rider already has a ride that has not finished.
 *
 * 409, and enforced by the database rather than by a check in this service.
 * `one_active_ride_per_rider` is a partial unique index (database-erd.md N2),
 * so two booking requests arriving together produce one ride and one
 * conflict. A read-then-write in application code would let both pass the
 * check before either wrote, and the rider would end up on two rides at once
 * with two drivers dispatched.
 */
export class RiderAlreadyOnRideError extends ConflictError {
  public readonly code = 'RIDER_ALREADY_ON_RIDE';
  public readonly title = 'You are already on a ride';

  public constructor() {
    super(
      'You already have a ride in progress. Finish or cancel it before ' +
        'booking another.',
    );
  }
}
