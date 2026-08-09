import {
  type Coordinates,
  type RideStatus,
  type VehicleType,
} from '@cholojai/shared';

/**
 * What the rides module needs from storage.
 */

/** The five fare columns, exactly as they land on the row (N3). */
export interface FareSnapshot {
  readonly base: number;
  readonly distance: number;
  readonly time: number;
  readonly discount: number;
  readonly total: number;
}

export interface CreateRideInput {
  readonly riderId: string;
  readonly fareQuoteId: string;
  readonly vehicleType: VehicleType;
  readonly pickup: Coordinates;
  readonly pickupAddress: string;
  readonly dropoff: Coordinates;
  readonly dropoffAddress: string;
  readonly distanceMetres: number;
  readonly durationSeconds: number;
  readonly fare: FareSnapshot;
}

export interface RideRecord extends CreateRideInput {
  readonly id: string;
  readonly status: RideStatus;
  readonly requestedAt: Date;
}

export interface RideRepository {
  /**
   * Create a `REQUESTED` ride.
   *
   * Throws `RiderAlreadyOnRideError` when the rider already has a
   * non-terminal ride. Both adapters must enforce that — the Prisma one by
   * letting `one_active_ride_per_rider` fire, the in-memory one by scanning
   * — because a fake that permits what the database forbids lets a test
   * prove a guarantee the system does not have.
   */
  create(input: CreateRideInput): Promise<RideRecord>;

  findActiveForRider(riderId: string): Promise<RideRecord | null>;
}

export const RIDE_REPOSITORY = Symbol('RIDE_REPOSITORY');
