import {
  type FareOption,
  RideStatus,
  VehicleType,
  VEHICLE_TYPE_ORDER,
} from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';

import { InMemoryFareQuoteRepository } from '../../testing/in-memory-fare-quote.repository';
import { InMemoryRideRepository } from '../../testing/in-memory-ride.repository';

import {
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
  return { service: new RidesService(rides, quotes), quotes, rides };
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
