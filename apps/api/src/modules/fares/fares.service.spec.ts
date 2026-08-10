import { PRICING, VEHICLE_TYPE_ORDER, VehicleType } from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';
import { type Redis } from 'ioredis';

import { makeTestConfig } from '../../testing/env.fixture';
import { InMemoryFareQuoteRepository } from '../../testing/in-memory-fare-quote.repository';
import { InMemoryGeocodingProvider } from '../../testing/in-memory-geocoding.provider';
import { InMemoryRoutingProvider } from '../../testing/in-memory-routing.provider';
import { GeoService } from '../geo/geo.service';

import { RouteTooLongError } from './fares.errors';
import { FaresService } from './fares.service';

/**
 * Redis stand-in that never caches, so every call reaches the provider.
 *
 * Caching is GeoService's concern and is covered by its own suite; here it
 * would only make the assertions about routing calls ambiguous.
 */
const NO_CACHE = {
  get: (): Promise<string | null> => Promise.resolve(null),
  set: (): Promise<'OK'> => Promise.resolve('OK'),
} as unknown as Redis;

const DHANMONDI = { lat: 23.7461, lng: 90.376 };
const BANANI = { lat: 23.7936, lng: 90.4043 };
const SYLHET = { lat: 24.8949, lng: 91.8687 };

function makeService(overrides: Record<string, string> = {}): {
  service: FaresService;
  quotes: InMemoryFareQuoteRepository;
} {
  const config = makeTestConfig(overrides);
  const geo = new GeoService(
    new InMemoryRoutingProvider(),
    new InMemoryGeocodingProvider(),
    NO_CACHE,
    config,
  );
  const quotes = new InMemoryFareQuoteRepository();

  return { service: new FaresService(geo, quotes, config), quotes };
}

const REQUEST = {
  pickup: DHANMONDI,
  pickupAddress: 'Dhanmondi 27',
  dropoff: BANANI,
  dropoffAddress: 'Banani 11',
};

describe('FaresService', () => {
  it('prices every vehicle type for one journey', async () => {
    const { service } = makeService();

    const quote = await service.quote(REQUEST);

    expect(quote.options.map((option) => option.vehicleType)).toEqual([
      ...VEHICLE_TYPE_ORDER,
    ]);
  });

  it('orders options cheapest first', async () => {
    /* The picker renders this order. If a rate change ever inverted it, the
       list would silently claim the wrong option costs least — so the
       ordering is asserted here as well as in fare.test.ts, because this is
       where the array is actually built. */
    const { service } = makeService();

    const totals = (await service.quote(REQUEST)).options.map(
      (option) => option.breakdown.total,
    );

    expect(totals).toEqual([...totals].sort((a, b) => a - b));
  });

  it('prices from the measured route, not from anything the client sent', async () => {
    /* The request carries no distance. This is the property that stops a
       rider sending distanceMetres=1 and booking a city crossing for the
       base fare, and it is the reason routing was pulled into M5 at all. */
    const { service } = makeService();

    const quote = await service.quote(REQUEST);
    const bike = quote.options.find(
      (option) => option.vehicleType === VehicleType.BIKE,
    );

    expect(quote.distanceMetres).toBeGreaterThan(0);
    expect(bike?.breakdown.base).toBe(PRICING.BIKE.baseFare);
    expect(bike?.breakdown.total).toBeGreaterThan(PRICING.BIKE.baseFare);
  });

  it('keeps each option’s total equal to the sum of its parts', async () => {
    /* The invariant the rides table enforces with a CHECK constraint. If it
       failed here, booking would 500 on a constraint violation for a rider
       who did nothing wrong. */
    const { service } = makeService();

    for (const { breakdown } of (await service.quote(REQUEST)).options) {
      expect(breakdown.total).toBe(
        breakdown.base +
          breakdown.distance +
          breakdown.time -
          breakdown.discount,
      );
    }
  });

  it('persists the quote so booking can consume it by id', async () => {
    const { service, quotes } = makeService();

    const quote = await service.quote(REQUEST);
    const stored = await quotes.findById(quote.id);

    expect(quotes.size).toBe(1);
    expect(stored?.distanceMetres).toBe(quote.distanceMetres);
    expect(stored?.options).toEqual(quote.options);
  });

  it('stores an absolute expiry taken from the server clock', async () => {
    /* Absolute rather than a duration: a TTL starts counting whenever the
       client reads it, and the server's clock is the only one that decides
       whether booking succeeds. */
    const before = Date.now();
    const { service } = makeService({ FARE_QUOTE_TTL_SECONDS: '300' });

    const expiresAt = Date.parse((await service.quote(REQUEST)).expiresAt);

    expect(expiresAt).toBeGreaterThanOrEqual(before + 300_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 300_000);
  });

  it('refuses a journey longer than the configured ceiling', async () => {
    const { service, quotes } = makeService({
      FARE_MAX_DISTANCE_METRES: '100000',
    });

    await expect(
      service.quote({ ...REQUEST, dropoff: SYLHET }),
    ).rejects.toThrow(RouteTooLongError);

    /* Nothing is stored for a journey we refused to price — a quote row that
       can never be booked is a row that will be found expired later and
       diagnosed as something else. */
    expect(quotes.size).toBe(0);
  });
});
