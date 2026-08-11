import {
  CouponKind,
  PRICING,
  VEHICLE_TYPE_ORDER,
  VehicleType,
} from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';
import { type Redis } from 'ioredis';

import { makeTestConfig } from '../../testing/env.fixture';
import { InMemoryFareQuoteRepository } from '../../testing/in-memory-fare-quote.repository';
import { InMemoryGeocodingProvider } from '../../testing/in-memory-geocoding.provider';
import { InMemoryRoutingProvider } from '../../testing/in-memory-routing.provider';
import { type CouponsService } from '../coupons/coupons.service';
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

/**
 * Never consulted: no test here sends a code.
 *
 * It rejects rather than resolving so that a future test which starts
 * passing `couponCode` fails loudly instead of quietly pricing without the
 * discount. Coupons have their own suite.
 */
const NO_COUPONS = {
  evaluate: () => Promise.reject(new Error('no coupon expected here')),
} as unknown as CouponsService;

/** A running 10% campaign, for the tests that need one to apply. */
function makeServiceWithCoupon(): FaresService {
  const config = makeTestConfig();
  const geo = new GeoService(
    new InMemoryRoutingProvider(),
    new InMemoryGeocodingProvider(),
    NO_CACHE,
    config,
  );

  const coupons = {
    evaluate: () =>
      Promise.resolve({
        couponId: 'coupon_1',
        code: 'WELCOME10',
        kind: CouponKind.PERCENT,
        value: 10,
        discountFor: (subtotal: number) => Math.floor(subtotal / 10),
      }),
  } as unknown as CouponsService;

  return new FaresService(
    geo,
    new InMemoryFareQuoteRepository(),
    config,
    coupons,
  );
}

const RIDER = 'user_rider_1';

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

  return {
    service: new FaresService(geo, quotes, config, NO_COUPONS),
    quotes,
  };
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

    const quote = await service.quote(RIDER, REQUEST);

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

    const totals = (await service.quote(RIDER, REQUEST)).options.map(
      (option) => option.breakdown.total,
    );

    expect(totals).toEqual([...totals].sort((a, b) => a - b));
  });

  it('prices from the measured route, not from anything the client sent', async () => {
    /* The request carries no distance. This is the property that stops a
       rider sending distanceMetres=1 and booking a city crossing for the
       base fare, and it is the reason routing was pulled into M5 at all. */
    const { service } = makeService();

    const quote = await service.quote(RIDER, REQUEST);
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

    for (const { breakdown } of (await service.quote(RIDER, REQUEST)).options) {
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

    const quote = await service.quote(RIDER, REQUEST);
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

    const expiresAt = Date.parse(
      (await service.quote(RIDER, REQUEST)).expiresAt,
    );

    expect(expiresAt).toBeGreaterThanOrEqual(before + 300_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 300_000);
  });

  it('refuses a journey longer than the configured ceiling', async () => {
    const { service, quotes } = makeService({
      FARE_MAX_DISTANCE_METRES: '100000',
    });

    await expect(
      service.quote(RIDER, { ...REQUEST, dropoff: SYLHET }),
    ).rejects.toThrow(RouteTooLongError);

    /* Nothing is stored for a journey we refused to price — a quote row that
       can never be booked is a row that will be found expired later and
       diagnosed as something else. */
    expect(quotes.size).toBe(0);
  });

  describe('with a coupon', () => {
    it('keeps the five columns consistent after discounting', async () => {
      /* The invariant `fare_total_is_consistent` enforces in the database.
         Asserted here because a quote that violates it does not fail at
         quote time — it fails at booking, as a 500, on a price the rider
         has already accepted. */
      const quote = await makeServiceWithCoupon().quote(RIDER, {
        ...REQUEST,
        couponCode: 'WELCOME10',
      });

      for (const { breakdown } of quote.options) {
        expect(
          breakdown.base +
            breakdown.distance +
            breakdown.time -
            breakdown.discount,
        ).toBe(breakdown.total);
      }
    });

    it('discounts every vehicle type, each by its own share', async () => {
      /* A percentage is of each option's own fare, so the cheapest option
         gets the smallest reduction — not a flat amount copied across. */
      const plain = await makeService().service.quote(RIDER, REQUEST);
      const discounted = await makeServiceWithCoupon().quote(RIDER, {
        ...REQUEST,
        couponCode: 'WELCOME10',
      });

      discounted.options.forEach((option, index) => {
        const before = plain.options[index]?.breakdown.total ?? 0;

        expect(option.breakdown.discount).toBe(Math.floor(before / 10));
        expect(option.breakdown.total).toBe(before - Math.floor(before / 10));
      });
    });

    it('names the campaign that priced the quote', async () => {
      const quote = await makeServiceWithCoupon().quote(RIDER, {
        ...REQUEST,
        couponCode: 'WELCOME10',
      });

      expect(quote.appliedCoupon?.code).toBe('WELCOME10');
    });

    it('reports no campaign when no code was sent', async () => {
      const quote = await makeService().service.quote(RIDER, REQUEST);

      expect(quote.appliedCoupon).toBeNull();
      expect(
        quote.options.every((option) => option.breakdown.discount === 0),
      ).toBe(true);
    });
  });
});
