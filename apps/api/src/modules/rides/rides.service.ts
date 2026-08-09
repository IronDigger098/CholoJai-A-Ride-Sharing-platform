import {
  type BookRideRequest,
  CancelledBy,
  canTransition,
  type Ride,
  RideStatus,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import {
  FARE_QUOTE_REPOSITORY,
  type FareQuoteRepository,
} from '../fares/fare-quote-repository.port';

import {
  RIDE_REPOSITORY,
  type RideRecord,
  type RideRepository,
} from './ride-repository.port';
import {
  IllegalRideTransitionError,
  QuoteExpiredError,
  QuoteNotFoundError,
  RideNotFoundError,
  VehicleTypeNotQuotedError,
} from './rides.errors';

/**
 * Booking a ride from a quote.
 *
 * The service does three things and refuses in three ways: the quote must
 * exist, must still be valid, and must actually contain the vehicle type
 * being booked. Nothing is re-priced here — the whole point of D2 is that
 * the number the rider accepted is the number that lands on the ride.
 *
 * "One active ride per rider" is *not* checked here. It is a partial unique
 * index (database-erd.md N2), and a check in this method would be a race
 * rather than a guarantee.
 */
@Injectable()
export class RidesService {
  public constructor(
    @Inject(RIDE_REPOSITORY) private readonly rides: RideRepository,
    @Inject(FARE_QUOTE_REPOSITORY)
    private readonly quotes: FareQuoteRepository,
  ) {}

  public async book(riderId: string, request: BookRideRequest): Promise<Ride> {
    const quote = await this.quotes.findById(request.quoteId);

    if (quote === null) {
      throw new QuoteNotFoundError(request.quoteId);
    }

    /* The server's clock, not the client's. `expiresAt` was written from it
       too, so the only comparison that matters happens entirely on this
       side of the wire. */
    if (quote.expiresAt.getTime() <= Date.now()) {
      throw new QuoteExpiredError();
    }

    const option = quote.options.find(
      (candidate) => candidate.vehicleType === request.vehicleType,
    );

    if (option === undefined) {
      throw new VehicleTypeNotQuotedError(request.vehicleType);
    }

    const ride = await this.rides.create({
      riderId,
      fareQuoteId: quote.id,
      vehicleType: request.vehicleType,
      pickup: quote.pickup,
      pickupAddress: quote.pickupAddress,
      dropoff: quote.dropoff,
      dropoffAddress: quote.dropoffAddress,
      distanceMetres: quote.distanceMetres,
      durationSeconds: quote.durationSeconds,
      /* Copied, not referenced. Rates change; a completed ride's receipt
         must not (D2). The database verifies the arithmetic survived the
         copy with a CHECK constraint (N3). */
      fare: option.breakdown,
    });

    return toRide(ride);
  }

  public async findActive(riderId: string): Promise<Ride | null> {
    const ride = await this.rides.findActiveForRider(riderId);
    return ride === null ? null : toRide(ride);
  }

  /**
   * Cancel a ride the caller owns.
   *
   * Which states allow this is not decided here — `RIDE_TRANSITIONS` in
   * `packages/shared` is the single definition of the machine, and the web
   * app disables its own button from the same table. A rule written twice is
   * a rule that will eventually be enforced twice differently.
   *
   * One consequence worth knowing: `IN_PROGRESS` has only `COMPLETED` as a
   * successor, so a rider cannot cancel once the journey has started. That
   * is the state machine's answer, not an oversight.
   */
  public async cancel(
    riderId: string,
    rideId: string,
    reason?: string,
  ): Promise<Ride> {
    const ride = await this.rides.findById(rideId);

    /* Ownership failure reads as "not found" on purpose — see
       RideNotFoundError. A 403 would confirm that a guessed id is real.
       The optional chain covers both cases at once: a missing ride yields
       `undefined`, which never equals a real rider id. */
    if (ride?.riderId !== riderId) {
      throw new RideNotFoundError(rideId);
    }

    if (!canTransition(ride.status, RideStatus.CANCELLED)) {
      throw new IllegalRideTransitionError(ride.status, RideStatus.CANCELLED);
    }

    const moved = await this.rides.transition({
      rideId,
      from: ride.status,
      to: RideStatus.CANCELLED,
      at: new Date(),
      cancelledBy: CancelledBy.RIDER,
      ...(reason === undefined ? {} : { cancelReason: reason }),
    });

    /* The check above ran against a status read a moment ago. If nothing
       moved, the ride left that status in between — a driver accepted, or a
       second cancel request won the race. Same answer as the first check,
       because from the caller's point of view the same thing is true. */
    if (!moved) {
      throw new IllegalRideTransitionError(ride.status, RideStatus.CANCELLED);
    }

    const cancelled = await this.rides.findById(rideId);

    /* Cannot be null: the transition just updated this row, and nothing
       deletes rides. Guarded rather than asserted, because a non-null
       assertion here would be a promise the type system cannot keep. */
    if (cancelled === null) throw new RideNotFoundError(rideId);

    return toRide(cancelled);
  }
}

function toRide(record: RideRecord): Ride {
  return {
    id: record.id,
    status: record.status,
    vehicleType: record.vehicleType,
    pickup: record.pickup,
    pickupAddress: record.pickupAddress,
    dropoff: record.dropoff,
    dropoffAddress: record.dropoffAddress,
    distanceMetres: record.distanceMetres,
    durationSeconds: record.durationSeconds,
    fare: record.fare,
    requestedAt: record.requestedAt.toISOString(),
  };
}
