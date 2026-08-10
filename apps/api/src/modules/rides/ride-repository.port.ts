import {
  type CancelledBy,
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
  /** Null until a driver accepts (schema.prisma). */
  readonly driverProfileId: string | null;
  readonly vehicleId: string | null;
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

  findById(rideId: string): Promise<RideRecord | null>;

  /**
   * Move a ride from one status to another, if it is still in `from`.
   *
   * Returns `false` when nothing moved — the ride had already left `from`
   * because someone else acted on it first.
   *
   * The `from` argument is the entire point. Reading the ride, checking its
   * status, and then writing the new one is two statements with a gap
   * between them, and in that gap a driver can accept, a rider can cancel,
   * or a timeout can expire the ride. Putting `from` in the WHERE clause
   * makes the check and the write one statement that PostgreSQL evaluates
   * atomically, so two concurrent transitions produce exactly one `true`.
   *
   * The same trick as `VerificationTokenRepository.consume`, for the same
   * reason.
   */
  transition(input: TransitionRideInput): Promise<boolean>;

  /**
   * One page of a rider's history, newest first.
   *
   * Returns up to `limit` rows plus whether more exist. Implementations read
   * `limit + 1` and discard the extra rather than issuing a second COUNT —
   * the count would be a full scan of the rider's history on every page, to
   * answer a question the UI asks as "is there a next page", not "how many".
   */
  listForRider(riderId: string, page: RidePageQuery): Promise<RidePageResult>;
}

export interface RidePageQuery {
  readonly limit: number;
  /** Id of the last row of the previous page. */
  readonly cursor?: string;
}

export interface RidePageResult {
  readonly rides: readonly RideRecord[];
  readonly hasNextPage: boolean;
}

export interface TransitionRideInput {
  readonly rideId: string;
  readonly from: RideStatus;
  readonly to: RideStatus;
  /** Written to the timestamp column belonging to `to`. */
  readonly at: Date;
  readonly cancelledBy?: CancelledBy;
  readonly cancelReason?: string;
  /**
   * Driver and vehicle, attached as part of the same statement.
   *
   * Accepting is one write, not two. Assigning the driver and then moving
   * the status would leave a window where a ride has a driver but is still
   * REQUESTED — visible to the next driver polling for offers, who would
   * accept a ride someone else is already driving to. Putting the
   * assignment in the same UPDATE means the partial unique index sees the
   * final state and refuses the second acceptance.
   */
  readonly assign?: { driverProfileId: string; vehicleId: string };
  /**
   * Restrict the write to a ride this driver already holds.
   *
   * `arrive`, `start` and `complete` pass it so ownership is part of the
   * WHERE clause rather than a read beforehand — the same reason `from` is.
   */
  readonly requireDriverProfileId?: string;
}

export const RIDE_REPOSITORY = Symbol('RIDE_REPOSITORY');
