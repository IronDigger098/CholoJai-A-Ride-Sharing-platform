import {
  type BookRideRequest,
  CancelledBy,
  canTransition,
  NotificationKind,
  type Ride,
  type RideListQuery,
  type RidePage,
  RideStatus,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import { CouponsService } from '../coupons/coupons.service';
import { DriversService } from '../drivers/drivers.service';
import {
  FARE_QUOTE_REPOSITORY,
  type FareQuoteRepository,
} from '../fares/fare-quote-repository.port';
import { NotificationsService } from '../notifications/notifications.service';
import { VehiclesService } from '../vehicles/vehicles.service';

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
    /* The rides module never touches a driver or vehicle repository. It
       asks one question — "who is this driver and what are they driving?" —
       and the vehicles module answers it, approval check included. */
    private readonly vehicles: VehiclesService,
    /* For one question only: which account a driver profile belongs to, so
       a cancelled ride can reach the driver who was on their way to it. */
    private readonly drivers: DriversService,
    private readonly notifications: NotificationsService,
    /* Only to spend a code the quote already recorded. Booking never
       evaluates one: the price was agreed when the quote was made, and
       re-checking here could refuse a discount the rider was shown. */
    private readonly coupons: CouponsService,
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

    /* After the ride row exists, and never before: redemption records a
       ride id, and a budget spent on a booking that then failed the
       one-active-ride index would be spent on nothing.

       The discount comes from the option the rider chose, not from
       re-evaluating the campaign — a percentage takes a different amount off
       each vehicle type, and only one of them was booked.

       Not awaited for its answer. `redeem` returns false when the budget ran
       out in between and logs it; the ride is already created at the quoted
       price, and unwinding it to protect a marketing budget would cost the
       rider a ride they have accepted. */
    if (quote.couponId !== undefined && option.breakdown.discount > 0) {
      await this.coupons.redeem({
        couponId: quote.couponId,
        userId: riderId,
        rideId: ride.id,
        amountPaisa: option.breakdown.discount,
      });
    }

    return toRide(ride);
  }

  /**
   * One page of the rider's history, newest first.
   *
   * Scoped to the caller rather than filtered by a `riderId` the client
   * sends. A query parameter would make "whose history?" a decision the
   * request gets to make, and the only correct answer is "the person
   * holding the token".
   */
  public async list(riderId: string, query: RideListQuery): Promise<RidePage> {
    const { rides, hasNextPage } = await this.rides.listForRider(riderId, {
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });

    const data = rides.map(toRide);

    return {
      data,
      pageInfo: {
        /* The last row of this page, not of the whole set — that is what
           the next request seeks past. Null on the final page so a client
           cannot loop forever asking for more. */
        nextCursor: hasNextPage ? (data.at(-1)?.id ?? null) : null,
        hasNextPage,
      },
    };
  }

  /**
   * A single ride the caller owns.
   *
   * Same 404-for-not-yours rule as `cancel`: a 403 would tell anyone
   * guessing ride ids which ones exist.
   */
  public async findForRider(riderId: string, rideId: string): Promise<Ride> {
    const ride = await this.rides.findById(rideId);

    if (ride?.riderId !== riderId) {
      throw new RideNotFoundError(rideId);
    }

    return toRide(ride);
  }

  /**
   * A ride's status and the driver who took it.
   *
   * Separate from `findForRider` because the rider-facing `Ride` carries
   * neither, deliberately: a driver profile id is an identifier a rider has
   * no use for and no business holding. Callers that need to *act* on a
   * ride rather than display it ask for this instead, and the ownership
   * check is the same one.
   */
  public async findParticipants(
    riderId: string,
    rideId: string,
  ): Promise<{ status: RideStatus; driverProfileId: string | null }> {
    const ride = await this.rides.findById(rideId);

    if (ride?.riderId !== riderId) {
      throw new RideNotFoundError(rideId);
    }

    return { status: ride.status, driverProfileId: ride.driverProfileId };
  }

  /**
   * The ride the caller is currently on, in whichever capacity.
   *
   * Rider first, then driver. One endpoint rather than two because "my
   * current ride" is one question a person asks — and an account can be
   * both: a driver books rides of their own, and while riding they are a
   * rider. Checking that side first means the answer matches whichever hat
   * they are actually wearing, since the two indexes make it impossible to
   * hold an active ride in both roles at once.
   */
  public async findActive(userId: string): Promise<Ride | null> {
    const asRider = await this.rides.findActiveForRider(userId);
    if (asRider !== null) return toRide(asRider);

    const driverProfileId = await this.vehicles.findDriverProfileId(userId);
    if (driverProfileId === null) return null;

    const asDriver = await this.rides.findActiveForDriver(driverProfileId);
    return asDriver === null ? null : toRide(asDriver);
  }

  /**
   * Rides waiting for a driver.
   *
   * Every approved driver sees the same list — there is no matching engine,
   * and pretending otherwise by filtering on distance would be inventing a
   * dispatch policy the product has not decided. First to accept wins, and
   * the partial unique index makes that safe.
   *
   * Calling `requireDispatchTarget` rather than only checking approval is
   * deliberate: a driver with no active vehicle cannot accept anything, and
   * showing them a list of rides they will be refused is worse than telling
   * them why.
   */
  public async listOffers(userId: string): Promise<readonly Ride[]> {
    await this.vehicles.requireDispatchTarget(userId);

    return (await this.rides.listOpenOffers(OFFER_LIMIT)).map(toRide);
  }

  /**
   * Move a ride the driver is responsible for.
   *
   * `accept` is the one that differs: it attaches the driver and their
   * active vehicle in the same statement, and it does not require the ride
   * to already be theirs — that is the point of accepting. The other three
   * pass `requireDriverProfileId`, so a driver cannot advance someone else's
   * ride even with a valid id.
   *
   * The legality of each move still comes from `RIDE_TRANSITIONS`, not from
   * the table above: that table says which arrow each verb takes, and
   * `canTransition` says whether the arrow exists.
   */
  public async driverAction(
    userId: string,
    rideId: string,
    action: DriverAction,
  ): Promise<Ride> {
    const { from, to } = DRIVER_TRANSITIONS[action];
    const { driverProfileId, vehicleId } =
      await this.vehicles.requireDispatchTarget(userId);

    const ride = await this.rides.findById(rideId);

    if (ride === null) throw new RideNotFoundError(rideId);

    /* An accept is open to any approved driver; everything after it belongs
       to the driver already on the ride. A ride that is not theirs reads as
       not found, for the same reason it does on the rider side. */
    if (action !== 'accept' && ride.driverProfileId !== driverProfileId) {
      throw new RideNotFoundError(rideId);
    }

    if (!canTransition(ride.status, to)) {
      throw new IllegalRideTransitionError(ride.status, to);
    }

    const moved = await this.rides.transition({
      rideId,
      from,
      to,
      at: new Date(),
      ...(action === 'accept'
        ? { assign: { driverProfileId, vehicleId } }
        : { requireDriverProfileId: driverProfileId }),
    });

    /* Nothing moved: the ride left `from` between the read and the write.
       For an accept that means another driver got there first. */
    if (!moved) throw new IllegalRideTransitionError(ride.status, to);

    const updated = await this.rides.findById(rideId);
    if (updated === null) throw new RideNotFoundError(rideId);

    await this.announce(action, updated);

    return toRide(updated);
  }

  /**
   * Tell the rider what their driver just did.
   *
   * Only two of the four moves. `arrive` and `start` happen while the rider
   * is watching the ride screen, where the status is already live — a
   * notification would be telling someone something they are looking at.
   */
  private async announce(
    action: DriverAction,
    ride: RideRecord,
  ): Promise<void> {
    if (action === 'accept') {
      await this.notifications.notify({
        userId: ride.riderId,
        kind: NotificationKind.RIDE_ACCEPTED,
        title: 'Your driver is on the way',
        body: 'A driver accepted your ride.',
        href: `/rides/${ride.id}`,
      });
      return;
    }

    if (action === 'complete') {
      await this.notifications.notify({
        userId: ride.riderId,
        kind: NotificationKind.RIDE_COMPLETED,
        title: 'Ride finished',
        body: 'Thanks for riding. Tap to rate your driver.',
        href: `/rides/${ride.id}`,
      });
    }
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

    /* Only when someone was already on their way. A ride cancelled before
       any driver accepted it has nobody to tell. */
    if (cancelled.driverProfileId !== null) {
      const driverUserId = await this.drivers.findUserId(
        cancelled.driverProfileId,
      );

      if (driverUserId !== null) {
        await this.notifications.notify({
          userId: driverUserId,
          kind: NotificationKind.RIDE_CANCELLED,
          title: 'A ride was cancelled',
          body: 'The rider cancelled after you accepted. You are free again.',
          href: '/drive',
        });
      }
    }

    return toRide(cancelled);
  }
}

/**
 * Every driver-side move, in one shape.
 *
 * accept / arrive / start / complete differ only in which arrow of the state
 * machine they take and whether they attach a driver. Writing them as four
 * near-identical methods would be four places for the guard to drift.
 */
/** One screenful. Rows below it are stale before anyone scrolls to them. */
const OFFER_LIMIT = 20;

const DRIVER_TRANSITIONS = {
  accept: { from: RideStatus.REQUESTED, to: RideStatus.ACCEPTED },
  arrive: { from: RideStatus.ACCEPTED, to: RideStatus.ARRIVED },
  start: { from: RideStatus.ARRIVED, to: RideStatus.IN_PROGRESS },
  complete: { from: RideStatus.IN_PROGRESS, to: RideStatus.COMPLETED },
} as const satisfies Readonly<
  Record<string, { from: RideStatus; to: RideStatus }>
>;

export type DriverAction = keyof typeof DRIVER_TRANSITIONS;

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
