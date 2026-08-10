import {
  type FareOption,
  RideStatus,
  VehicleType,
  VEHICLE_TYPE_ORDER,
} from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';

import { InMemoryFareQuoteRepository } from '../../testing/in-memory-fare-quote.repository';
import { InMemoryRideRepository } from '../../testing/in-memory-ride.repository';
import { makeRecordingNotifications } from '../../testing/recording-notifications';
import { type DriversService } from '../drivers/drivers.service';
import { type VehiclesService } from '../vehicles/vehicles.service';

import {
  DriverAlreadyOnRideError,
  IllegalRideTransitionError,
  QuoteExpiredError,
  QuoteNotFoundError,
  RideNotFoundError,
  RiderAlreadyOnRideError,
  VehicleTypeNotQuotedError,
} from './rides.errors';
import { RidesService } from './rides.service';

const RIDER = 'user_rider_1';

const OPTIONS: FareOption[] = VEHICLE_TYPE_ORDER.map((vehicleType, index) => ({
  vehicleType,
  breakdown: {
    base: 5000 + index * 1000,
    distance: 12_600,
    time: 880,
    discount: 0,
    total: 18_480 + index * 1000,
  },
}));

function makeService(): {
  service: RidesService;
  quotes: InMemoryFareQuoteRepository;
  rides: InMemoryRideRepository;
} {
  const quotes = new InMemoryFareQuoteRepository();
  const rides = new InMemoryRideRepository();
  return {
    service: makeRides(rides, quotes, stubVehicles()),
    quotes,
    rides,
  };
}

/**
 * The service, with its two announcement collaborators stubbed out.
 *
 * Every test below is about the state machine rather than about who gets
 * told, so the default is a recorder nobody reads. The tests that *are*
 * about notifications build their own.
 */
function makeRides(
  rides: InMemoryRideRepository,
  quotes: InMemoryFareQuoteRepository,
  vehicles: VehiclesService,
): RidesService {
  return new RidesService(
    rides,
    quotes,
    vehicles,
    stubDrivers(),
    makeRecordingNotifications().service,
  );
}

/** The two questions RidesService asks the vehicles module. */
function stubVehicles(driverProfileId = 'driver_1'): VehiclesService {
  return {
    requireDispatchTarget: () =>
      Promise.resolve({ driverProfileId, vehicleId: 'vehicle_1' }),
    findDriverProfileId: () => Promise.resolve(driverProfileId),
  } as unknown as VehiclesService;
}

/** The one question it asks the drivers module. */
function stubDrivers(userId: string | null = 'user_driver_1'): DriversService {
  return {
    findUserId: () => Promise.resolve(userId),
  } as unknown as DriversService;
}

async function storeQuote(
  quotes: InMemoryFareQuoteRepository,
  expiresAt = new Date(Date.now() + 300_000),
): Promise<string> {
  const record = await quotes.create({
    pickup: { lat: 23.7461, lng: 90.376 },
    pickupAddress: 'Dhanmondi 27',
    dropoff: { lat: 23.7936, lng: 90.4043 },
    dropoffAddress: 'Banani 11',
    distanceMetres: 8400,
    durationSeconds: 660,
    options: OPTIONS,
    expiresAt,
  });

  return record.id;
}

describe('RidesService.book', () => {
  it('creates a REQUESTED ride from a valid quote', async () => {
    const { service, quotes } = makeService();
    const quoteId = await storeQuote(quotes);

    const ride = await service.book(RIDER, {
      quoteId,
      vehicleType: VehicleType.CNG,
    });

    expect(ride.status).toBe(RideStatus.REQUESTED);
    expect(ride.vehicleType).toBe(VehicleType.CNG);
    expect(ride.distanceMetres).toBe(8400);
  });

  it('snapshots the chosen option rather than referencing the quote', async () => {
    /* D2. The five numbers are copied onto the ride so a later rate change
       cannot rewrite a receipt — and they must be the numbers for the type
       actually booked, not the first option in the list. */
    const { service, quotes } = makeService();
    const quoteId = await storeQuote(quotes);

    const chosen = OPTIONS.find(
      (option) => option.vehicleType === VehicleType.CAR,
    );
    const ride = await service.book(RIDER, {
      quoteId,
      vehicleType: VehicleType.CAR,
    });

    expect(ride.fare).toEqual(chosen?.breakdown);
  });

  it('keeps the snapshot satisfying the CHECK constraint', async () => {
    /* `total = base + distance + time - discount` is enforced by the
       database. If the copy ever broke it, booking would 500 on a
       constraint violation for a rider who did nothing wrong. */
    const { service, quotes } = makeService();
    const quoteId = await storeQuote(quotes);

    const { fare } = await service.book(RIDER, {
      quoteId,
      vehicleType: VehicleType.BIKE,
    });

    expect(fare.total).toBe(
      fare.base + fare.distance + fare.time - fare.discount,
    );
  });

  it('rejects a quote id that was never issued', async () => {
    const { service } = makeService();

    await expect(
      service.book(RIDER, {
        quoteId: 'quote_nope',
        vehicleType: VehicleType.CNG,
      }),
    ).rejects.toThrow(QuoteNotFoundError);
  });

  it('rejects an expired quote distinctly from a missing one', async () => {
    /* The reason the repository returns expired rows instead of hiding
       them: a client told 404 cannot tell whether to re-quote or report a
       bug, and one told QUOTE_EXPIRED knows exactly what to do. */
    const { service, quotes } = makeService();
    const quoteId = await storeQuote(quotes, new Date(Date.now() - 1000));

    await expect(
      service.book(RIDER, { quoteId, vehicleType: VehicleType.CNG }),
    ).rejects.toThrow(QuoteExpiredError);
  });

  it('does not create a ride when the quote is expired', async () => {
    const { service, quotes, rides } = makeService();
    const quoteId = await storeQuote(quotes, new Date(Date.now() - 1000));

    await expect(
      service.book(RIDER, { quoteId, vehicleType: VehicleType.CNG }),
    ).rejects.toThrow(QuoteExpiredError);
    expect(rides.size).toBe(0);
  });

  it('refuses a vehicle type the quote never priced', async () => {
    /* Only reachable from a client sending a type the server did not offer.
       Pricing it now, at booking time, would mean charging from rules
       nobody agreed to. */
    const { service, quotes } = makeService();
    const record = await quotes.create({
      pickup: { lat: 23.7461, lng: 90.376 },
      pickupAddress: 'Dhanmondi 27',
      dropoff: { lat: 23.7936, lng: 90.4043 },
      dropoffAddress: 'Banani 11',
      distanceMetres: 8400,
      durationSeconds: 660,
      options: OPTIONS.filter(
        (option) => option.vehicleType !== VehicleType.CAR,
      ),
      expiresAt: new Date(Date.now() + 300_000),
    });

    await expect(
      service.book(RIDER, {
        quoteId: record.id,
        vehicleType: VehicleType.CAR,
      }),
    ).rejects.toThrow(VehicleTypeNotQuotedError);
  });

  it('refuses a second ride while one is still running', async () => {
    /* The partial unique index, mirrored by the in-memory fake. The real
       guarantee is the database's — this asserts the fake agrees with it,
       so a unit test can never prove something the system does not do. */
    const { service, quotes } = makeService();

    await service.book(RIDER, {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });

    await expect(
      service.book(RIDER, {
        quoteId: await storeQuote(quotes),
        vehicleType: VehicleType.CNG,
      }),
    ).rejects.toThrow(RiderAlreadyOnRideError);
  });

  it('lets a different rider book at the same time', async () => {
    const { service, quotes, rides } = makeService();

    await service.book(RIDER, {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });
    await service.book('user_rider_2', {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.BIKE,
    });

    expect(rides.size).toBe(2);
  });
});

describe('RidesService.cancel', () => {
  async function bookRide(): Promise<{
    service: RidesService;
    rides: InMemoryRideRepository;
    rideId: string;
  }> {
    const { service, quotes, rides } = makeService();
    const ride = await service.book(RIDER, {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });

    return { service, rides, rideId: ride.id };
  }

  it('cancels a requested ride', async () => {
    const { service, rideId } = await bookRide();

    const cancelled = await service.cancel(RIDER, rideId);

    expect(cancelled.status).toBe(RideStatus.CANCELLED);
  });

  it('frees the rider to book again', async () => {
    /* CANCELLED is terminal, so it leaves ACTIVE_RIDE_STATUSES and the
       one-active-ride rule stops applying. If cancelling did not actually
       move the status, this is where it would show. */
    const { service, rideId } = await bookRide();

    await service.cancel(RIDER, rideId);

    expect(await service.findActive(RIDER)).toBeNull();
  });

  it('refuses to cancel a ride that is already in progress', async () => {
    /* RIDE_TRANSITIONS gives IN_PROGRESS exactly one successor, COMPLETED.
       A rider cannot call off a journey they are already on — that is the
       machine's answer, not an omission. */
    const { service, rides, rideId } = await bookRide();

    await rides.transition({
      rideId,
      from: RideStatus.REQUESTED,
      to: RideStatus.ACCEPTED,
      at: new Date(),
    });
    await rides.transition({
      rideId,
      from: RideStatus.ACCEPTED,
      to: RideStatus.ARRIVED,
      at: new Date(),
    });
    await rides.transition({
      rideId,
      from: RideStatus.ARRIVED,
      to: RideStatus.IN_PROGRESS,
      at: new Date(),
    });

    await expect(service.cancel(RIDER, rideId)).rejects.toThrow(
      IllegalRideTransitionError,
    );
  });

  it('refuses to cancel a ride twice', async () => {
    const { service, rideId } = await bookRide();
    await service.cancel(RIDER, rideId);

    await expect(service.cancel(RIDER, rideId)).rejects.toThrow(
      IllegalRideTransitionError,
    );
  });

  it('hides another rider’s ride behind a 404', async () => {
    /* Not 403. A 403 would confirm the id is real to anyone who guesses
       one, and a rider who does not own the ride has no action on it
       either way. */
    const { service, rideId } = await bookRide();

    await expect(service.cancel('user_rider_2', rideId)).rejects.toThrow(
      RideNotFoundError,
    );
  });

  it('reports an unknown ride as not found', async () => {
    const { service } = await bookRide();

    await expect(service.cancel(RIDER, 'ride_nope')).rejects.toThrow(
      RideNotFoundError,
    );
  });
});

describe('RidesService driver actions', () => {
  const DRIVER_USER = 'user_driver_1';
  const DRIVER_PROFILE = 'driver_1';

  async function bookedRide(): Promise<{
    service: RidesService;
    rides: InMemoryRideRepository;
    rideId: string;
  }> {
    const quotes = new InMemoryFareQuoteRepository();
    const rides = new InMemoryRideRepository();
    const service = makeRides(rides, quotes, stubVehicles(DRIVER_PROFILE));

    const ride = await service.book(RIDER, {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });

    return { service, rides, rideId: ride.id };
  }

  it('accepts a requested ride and attaches the driver', async () => {
    const { service, rides, rideId } = await bookedRide();

    const accepted = await service.driverAction(DRIVER_USER, rideId, 'accept');

    expect(accepted.status).toBe(RideStatus.ACCEPTED);
    expect((await rides.findById(rideId))?.driverProfileId).toBe(
      DRIVER_PROFILE,
    );
  });

  it('walks the ride to completion', async () => {
    const { service, rideId } = await bookedRide();

    await service.driverAction(DRIVER_USER, rideId, 'accept');
    await service.driverAction(DRIVER_USER, rideId, 'arrive');
    await service.driverAction(DRIVER_USER, rideId, 'start');
    const done = await service.driverAction(DRIVER_USER, rideId, 'complete');

    expect(done.status).toBe(RideStatus.COMPLETED);
  });

  it('refuses to start a ride the driver has not arrived at', async () => {
    /* The state machine, not a rule written here: ACCEPTED has ARRIVED as
       its only forward move. */
    const { service, rideId } = await bookedRide();
    await service.driverAction(DRIVER_USER, rideId, 'accept');

    await expect(
      service.driverAction(DRIVER_USER, rideId, 'start'),
    ).rejects.toThrow(IllegalRideTransitionError);
  });

  it('refuses a second acceptance of the same ride', async () => {
    const { service, rideId } = await bookedRide();
    await service.driverAction(DRIVER_USER, rideId, 'accept');

    await expect(
      service.driverAction(DRIVER_USER, rideId, 'accept'),
    ).rejects.toThrow(IllegalRideTransitionError);
  });

  it('hides another driver’s ride behind a 404', async () => {
    /* Accepting is open to any approved driver; everything after it belongs
       to the driver already on the ride. */
    const { service, rides, rideId } = await bookedRide();
    await service.driverAction(DRIVER_USER, rideId, 'accept');

    const quotes = new InMemoryFareQuoteRepository();
    const other = makeRides(rides, quotes, stubVehicles('driver_2'));

    await expect(
      other.driverAction('user_driver_2', rideId, 'arrive'),
    ).rejects.toThrow(RideNotFoundError);
  });

  it('refuses a driver already on another ride', async () => {
    /* one_active_ride_per_driver, mirrored by the fake. The real guarantee
       is the index; this asserts the fake agrees with it. */
    const quotes = new InMemoryFareQuoteRepository();
    const rides = new InMemoryRideRepository();
    const service = makeRides(rides, quotes, stubVehicles(DRIVER_PROFILE));

    const first = await service.book(RIDER, {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });
    await service.driverAction(DRIVER_USER, first.id, 'accept');

    const second = await service.book('user_rider_2', {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });

    await expect(
      service.driverAction(DRIVER_USER, second.id, 'accept'),
    ).rejects.toThrow(DriverAlreadyOnRideError);
  });

  it('offers rides that are waiting for a driver', async () => {
    const { service, rideId } = await bookedRide();

    const offers = await service.listOffers(DRIVER_USER);

    expect(offers.map((ride) => ride.id)).toEqual([rideId]);
  });

  it('stops offering a ride once it is accepted', async () => {
    /* The list is filtered on REQUESTED *and* a null driver. The two should
       never disagree, but a list that dispatches drivers is the wrong place
       to assume that. */
    const { service, rideId } = await bookedRide();
    await service.driverAction(DRIVER_USER, rideId, 'accept');

    expect(await service.listOffers(DRIVER_USER)).toEqual([]);
  });

  it('reports the accepted ride as the driver’s current one', async () => {
    /* `findActive` answers for whichever capacity the caller is in. Without
       this the driver branch is uncovered, and a driver reloading mid-ride
       would silently see nothing. */
    const { service, rideId } = await bookedRide();
    await service.driverAction(DRIVER_USER, rideId, 'accept');

    expect((await service.findActive(DRIVER_USER))?.id).toBe(rideId);
  });

  it('frees the driver once the ride is complete', async () => {
    const { service, rides, rideId } = await bookedRide();
    await service.driverAction(DRIVER_USER, rideId, 'accept');
    await service.driverAction(DRIVER_USER, rideId, 'arrive');
    await service.driverAction(DRIVER_USER, rideId, 'start');
    await service.driverAction(DRIVER_USER, rideId, 'complete');

    const quotes = new InMemoryFareQuoteRepository();
    const service2 = makeRides(rides, quotes, stubVehicles(DRIVER_PROFILE));
    const next = await service2.book('user_rider_3', {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });

    await expect(
      service2.driverAction(DRIVER_USER, next.id, 'accept'),
    ).resolves.toMatchObject({ status: RideStatus.ACCEPTED });
  });
});

describe('RidesService.list', () => {
  /** Book and immediately cancel, so the rider is free to book again. */
  async function bookHistory(
    service: RidesService,
    quotes: InMemoryFareQuoteRepository,
    count: number,
  ): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const ride = await service.book(RIDER, {
        quoteId: await storeQuote(quotes),
        vehicleType: VehicleType.CNG,
      });
      await service.cancel(RIDER, ride.id);
    }
  }

  it('returns a page no larger than the limit', async () => {
    const { service, quotes } = makeService();
    await bookHistory(service, quotes, 5);

    const page = await service.list(RIDER, { limit: 2 });

    expect(page.data).toHaveLength(2);
    expect(page.pageInfo.hasNextPage).toBe(true);
  });

  it('walks the whole history without repeating or skipping a ride', async () => {
    /* The property cursor pagination exists for. Asserted by collecting
       every page and comparing the set, because an off-by-one in the cursor
       shows up as a duplicate or a gap and not as an error. */
    const { service, quotes } = makeService();
    await bookHistory(service, quotes, 5);

    const seen: string[] = [];
    let cursor: string | undefined;

    do {
      const page: Awaited<ReturnType<typeof service.list>> = await service.list(
        RIDER,
        {
          limit: 2,
          ...(cursor === undefined ? {} : { cursor }),
        },
      );

      seen.push(...page.data.map((ride) => ride.id));
      cursor = page.pageInfo.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('reports no next page on the last one', async () => {
    const { service, quotes } = makeService();
    await bookHistory(service, quotes, 2);

    const page = await service.list(RIDER, { limit: 10 });

    expect(page.pageInfo.hasNextPage).toBe(false);
    expect(page.pageInfo.nextCursor).toBeNull();
  });

  it('never returns another rider’s rides', async () => {
    const { service, quotes } = makeService();
    await bookHistory(service, quotes, 2);
    await service.book('user_rider_2', {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.BIKE,
    });

    const page = await service.list(RIDER, { limit: 50 });

    expect(page.data).toHaveLength(2);
  });

  it('returns an empty page for a rider with no history', async () => {
    const { service } = makeService();

    const page = await service.list('user_rider_nobody', { limit: 10 });

    expect(page.data).toEqual([]);
    expect(page.pageInfo).toEqual({ nextCursor: null, hasNextPage: false });
  });
});

describe('RidesService.findForRider', () => {
  it('returns the caller’s own ride', async () => {
    const { service, quotes } = makeService();
    const booked = await service.book(RIDER, {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });

    expect((await service.findForRider(RIDER, booked.id)).id).toBe(booked.id);
  });

  it('hides another rider’s ride behind a 404', async () => {
    const { service, quotes } = makeService();
    const booked = await service.book(RIDER, {
      quoteId: await storeQuote(quotes),
      vehicleType: VehicleType.CNG,
    });

    await expect(
      service.findForRider('user_rider_2', booked.id),
    ).rejects.toThrow(RideNotFoundError);
  });
});
