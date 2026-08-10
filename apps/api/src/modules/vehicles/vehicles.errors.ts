import { ConflictError, NotFoundError } from '../../common/errors/domain-error';

/**
 * The driver has no active vehicle.
 *
 * 409 rather than 403: they are permitted to accept rides, they just have
 * nothing to carry anyone in. Reachable in ordinary use — a driver who has
 * removed their only vehicle, or an approved applicant who has not
 * registered one yet.
 */
export class NoActiveVehicleError extends ConflictError {
  public readonly code = 'NO_ACTIVE_VEHICLE';
  public readonly title = 'You have no active vehicle';

  public constructor() {
    super('Register a vehicle and make it active before accepting rides.');
  }
}

/**
 * That plate is already registered.
 *
 * Globally unique, not per driver: two drivers cannot register the same
 * vehicle, because one of them is not telling the truth and the platform
 * cannot tell which. 409 rather than a validation error — the value is
 * well-formed, it is the world that disagrees.
 */
export class PlateAlreadyRegisteredError extends ConflictError {
  public readonly code = 'PLATE_ALREADY_REGISTERED';
  public readonly title = 'That plate is already registered';

  public constructor() {
    super(
      'A vehicle with that plate number is already registered. Contact ' +
        'support if you believe this is a mistake.',
    );
  }
}

/**
 * No such vehicle, or not the caller's.
 *
 * One error for both, as with rides: a 403 would confirm to anyone guessing
 * ids which vehicles exist, and a driver who does not own one has no action
 * available on it either way.
 */
export class VehicleNotFoundError extends NotFoundError {
  public readonly code = 'VEHICLE_NOT_FOUND';
  public readonly title = 'Vehicle not found';

  public constructor(vehicleId: string) {
    super(`No vehicle exists with id ${vehicleId}.`);
  }
}

/**
 * The driver is on a ride with this vehicle.
 *
 * Removing it would leave a ride pointing at a vehicle that no longer
 * exists, and `rides.vehicle_id` is `onDelete: Restrict` precisely so the
 * database refuses that. This turns the refusal into an explanation.
 */
export class VehicleInUseError extends ConflictError {
  public readonly code = 'VEHICLE_IN_USE';
  public readonly title = 'That vehicle is on a ride';

  public constructor() {
    super(
      'This vehicle is part of a ride and cannot be removed. Finish the ' +
        'ride first, or make another vehicle active instead.',
    );
  }
}
