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
  QuoteExpiredError,
  QuoteNotFoundError,
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
