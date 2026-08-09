import { describe, expect, it } from '@jest/globals';

import { formatTaka, paisa } from '../utils/money';

import { estimateAllFares, estimateFare, PRICING } from './fare';
import { VEHICLE_TYPE_ORDER, VehicleType } from './vehicle';

describe('estimateFare', () => {
  it('charges only the base fare for a zero-length ride', () => {
    const fare = estimateFare({
      vehicleType: VehicleType.CNG,
      distanceMetres: 0,
      durationSeconds: 0,
    });

    expect(fare).toEqual({
      base: PRICING.CNG.baseFare,
      distance: 0,
      time: 0,
      discount: 0,
      total: PRICING.CNG.baseFare,
    });
  });

  it('prices distance per kilometre and time per minute', () => {
    // 8.4 km at ৳15/km is ৳126; 11 minutes at ৳0.80/min is ৳8.80.
    const fare = estimateFare({
      vehicleType: VehicleType.CNG,
      distanceMetres: 8400,
      durationSeconds: 660,
    });

    expect(fare.distance).toBe(12_600);
    expect(fare.time).toBe(880);
    expect(fare.total).toBe(18_480);
  });

  it.each(VEHICLE_TYPE_ORDER)('prices %s from its own rates', (vehicleType) => {
    const fare = estimateFare({
      vehicleType,
      distanceMetres: 2000,
      durationSeconds: 300,
    });

    const rule = PRICING[vehicleType];
    expect(fare.base).toBe(rule.baseFare);
    expect(fare.distance).toBe(rule.perKilometre * 2);
    expect(fare.time).toBe(rule.perMinute * 5);
  });

  it('gets more expensive as the vehicle gets larger', () => {
    /* The vehicle picker shows types cheapest first (VEHICLE_TYPE_ORDER).
       If a rate change ever inverted that, the picker would silently be
       lying about which option costs least. */
    const totals = VEHICLE_TYPE_ORDER.map(
      (vehicleType) =>
        estimateFare({
          vehicleType,
          distanceMetres: 5000,
          durationSeconds: 600,
        }).total,
    );

    expect(totals).toEqual([...totals].sort((a, b) => a - b));
  });

  describe('rounding', () => {
    it('produces whole paisa for an awkward distance', () => {
      /* 1,234 m at ৳11/km is 1,357.4 paisa. Anything other than an integer
         here would fail the column type before it failed anything else. */
      const fare = estimateFare({
        vehicleType: VehicleType.BIKE,
        distanceMetres: 1234,
        durationSeconds: 97,
      });

      expect(Number.isInteger(fare.distance)).toBe(true);
      expect(Number.isInteger(fare.time)).toBe(true);
      expect(fare.distance).toBe(1357);
    });

    it('keeps the total equal to the sum of its parts, always', () => {
      /* The invariant the database enforces:
           CHECK (total = base + distance + time - discount)
         Rounding each component rather than the total is what makes this
         exact. Checked across a wide spread of awkward inputs rather than
         one example, because a rounding fault shows up at specific
         values and nowhere else. */
      for (let metres = 0; metres <= 40_000; metres += 137) {
        for (let seconds = 0; seconds <= 3600; seconds += 371) {
          for (const vehicleType of VEHICLE_TYPE_ORDER) {
            const fare = estimateFare({
              vehicleType,
              distanceMetres: metres,
              durationSeconds: seconds,
            });

            expect(fare.total).toBe(
              fare.base + fare.distance + fare.time - fare.discount,
            );
          }
        }
      }
    });
  });

  describe('discounts', () => {
    it('subtracts from the total', () => {
      const fare = estimateFare({
        vehicleType: VehicleType.CNG,
        distanceMetres: 8400,
        durationSeconds: 660,
        discount: paisa(5000),
      });

      expect(fare.discount).toBe(5000);
      expect(fare.total).toBe(13_480);
    });

    it('records what was applied, not what was offered', () => {
      /* A ৳500 coupon on a ৳80 ride makes the ride free — it does not owe
         the rider ৳420. Recording the offered figure would also break the
         arithmetic the database verifies, turning a generous coupon into a
         constraint violation at booking. */
      const fare = estimateFare({
        vehicleType: VehicleType.BIKE,
        distanceMetres: 0,
        durationSeconds: 0,
        discount: paisa(50_000),
      });

      expect(fare.total).toBe(0);
      expect(fare.discount).toBe(PRICING.BIKE.baseFare);
      expect(fare.total).toBe(
        fare.base + fare.distance + fare.time - fare.discount,
      );
    });
  });

  describe('rejects impossible input', () => {
    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses a distance of %p',
      (distanceMetres) => {
        expect(() =>
          estimateFare({
            vehicleType: VehicleType.CNG,
            distanceMetres,
            durationSeconds: 0,
          }),
        ).toThrow(RangeError);
      },
    );

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses a duration of %p',
      (durationSeconds) => {
        expect(() =>
          estimateFare({
            vehicleType: VehicleType.CNG,
            distanceMetres: 0,
            durationSeconds,
          }),
        ).toThrow(RangeError);
      },
    );
  });
});

describe('estimateAllFares', () => {
  it('prices every vehicle type for one route', () => {
    /* A quote offers all three at once, so the rider compares prices for
       the same journey rather than re-requesting per type. */
    const options = estimateAllFares({
      distanceMetres: 6000,
      durationSeconds: 900,
    });

    expect(Object.keys(options).sort()).toEqual(['BIKE', 'CAR', 'CNG']);

    for (const vehicleType of VEHICLE_TYPE_ORDER) {
      expect(options[vehicleType]).toEqual(
        estimateFare({
          vehicleType,
          distanceMetres: 6000,
          durationSeconds: 900,
        }),
      );
    }
  });
});

describe('presenting a breakdown', () => {
  /* The arithmetic being exact in paisa is not the same as the *rendered*
     figures adding up, because each is rounded independently. This is the
     rule every fare breakdown in the product has to follow. */

  const strip = (formatted: string): number =>
    Number(formatted.replace(/[^\d.]/gu, ''));

  it('adds up when rendered with decimals', () => {
    for (let metres = 200; metres <= 20_000; metres += 700) {
      for (let seconds = 60; seconds <= 2400; seconds += 180) {
        for (const vehicleType of VEHICLE_TYPE_ORDER) {
          const fare = estimateFare({
            vehicleType,
            distanceMetres: metres,
            durationSeconds: seconds,
          });

          const shown = [fare.base, fare.distance, fare.time]
            .map((amount) => strip(formatTaka(amount, { withDecimals: true })))
            .reduce((sum, amount) => sum + amount, 0);

          expect(shown).toBeCloseTo(
            strip(formatTaka(fare.total, { withDecimals: true })),
            2,
          );
        }
      }
    }
  });

  it('does not add up when rendered as whole taka', () => {
    /* Documented, not fixed. `formatTaka` rounding to whole taka is right
       for a single headline price and wrong for a column of them: a CAR
       over 200 m in two minutes shows ৳80 + ৳5 + ৳3, which is ৳88, above
       a total of ৳87. Every line of that display is individually correct.

       This test exists so that anyone tempted to drop `withDecimals` from
       a breakdown finds out here rather than from a rider counting. */
    const fare = estimateFare({
      vehicleType: VehicleType.CAR,
      distanceMetres: 200,
      durationSeconds: 120,
    });

    const shown = [fare.base, fare.distance, fare.time]
      .map((amount) => strip(formatTaka(amount)))
      .reduce((sum, amount) => sum + amount, 0);

    expect(shown).toBe(88);
    expect(strip(formatTaka(fare.total))).toBe(87);
  });
});
