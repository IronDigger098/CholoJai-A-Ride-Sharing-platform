import { CouponKind } from '@cholojai/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { InMemoryCouponRepository } from '../../testing/in-memory-coupon.repository';

import { type CouponRecord } from './coupon-repository.port';
import {
  CouponAlreadyUsedError,
  CouponExhaustedError,
  CouponForFirstRideOnlyError,
  CouponNotFoundError,
  CouponNotRunningError,
  FareBelowCouponMinimumError,
} from './coupons.errors';
import { CouponsService } from './coupons.service';

const RIDER = 'user_rider_1';
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2099-01-01T00:00:00.000Z');

/** A running percentage campaign, with every limit switched off. */
function makeCoupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: 'coupon_1',
    code: 'WELCOME10',
    kind: CouponKind.PERCENT,
    value: 10,
    maxDiscountPaisa: null,
    minFarePaisa: 0,
    maxRedemptions: null,
    perUserLimit: 1,
    redeemedCount: 0,
    firstRideOnly: false,
    startsAt: PAST,
    endsAt: null,
    isActive: true,
    createdAt: PAST,
    ...overrides,
  };
}

describe('CouponsService', () => {
  let coupons: InMemoryCouponRepository;
  let service: CouponsService;

  function withCoupon(overrides: Partial<CouponRecord> = {}): CouponsService {
    coupons = new InMemoryCouponRepository([makeCoupon(overrides)]);
    return new CouponsService(coupons);
  }

  beforeEach(() => {
    service = withCoupon();
  });

  describe('evaluate', () => {
    it('takes a percentage off a subtotal', async () => {
      const applied = await service.evaluate('WELCOME10', RIDER, 18_480);

      expect(applied.discountFor(18_480)).toBe(1848);
    });

    it('prices each vehicle type from the same evaluation', async () => {
      /* One quote, several fares. Returning a function rather than a number
         is what lets a percentage take a different amount off each. */
      const applied = await service.evaluate('WELCOME10', RIDER, 18_480);

      expect(applied.discountFor(20_000)).toBe(2000);
      expect(applied.discountFor(10_000)).toBe(1000);
    });

    it('rounds a percentage down', async () => {
      /* Never up. A discount rounded up is money the platform did not agree
         to give, on every ride, forever. */
      const applied = await service.evaluate('WELCOME10', RIDER, 18_485);

      expect(applied.discountFor(18_485)).toBe(1848);
    });

    it('honours a cap on a percentage', async () => {
      const capped = withCoupon({ value: 50, maxDiscountPaisa: 5000 });

      const applied = await capped.evaluate('WELCOME10', RIDER, 40_000);

      expect(applied.discountFor(40_000)).toBe(5000);
    });

    it('never discounts more than the fare', async () => {
      /* A negative total would fail the fare_total_is_consistent CHECK
         constraint, which is a 500 for a rider who typed a valid code. */
      const generous = withCoupon({
        kind: CouponKind.FIXED,
        value: 50_000,
      });

      const applied = await generous.evaluate('WELCOME10', RIDER, 18_480);

      expect(applied.discountFor(18_480)).toBe(18_480);
    });

    it('refuses a code that does not exist', async () => {
      await expect(service.evaluate('NOPE', RIDER, 18_480)).rejects.toThrow(
        CouponNotFoundError,
      );
    });

    it('refuses a retired campaign', async () => {
      const retired = withCoupon({ isActive: false });

      await expect(
        retired.evaluate('WELCOME10', RIDER, 18_480),
      ).rejects.toThrow(CouponNotRunningError);
    });

    it('refuses one that has not started', async () => {
      const early = withCoupon({ startsAt: FUTURE });

      await expect(early.evaluate('WELCOME10', RIDER, 18_480)).rejects.toThrow(
        CouponNotRunningError,
      );
    });

    it('refuses one that has ended', async () => {
      const over = withCoupon({ endsAt: PAST });

      await expect(over.evaluate('WELCOME10', RIDER, 18_480)).rejects.toThrow(
        CouponNotRunningError,
      );
    });

    it('refuses a fare below the minimum', async () => {
      const bigRidesOnly = withCoupon({ minFarePaisa: 20_000 });

      await expect(
        bigRidesOnly.evaluate('WELCOME10', RIDER, 18_480),
      ).rejects.toThrow(FareBelowCouponMinimumError);
    });

    it('refuses once the budget is spent', async () => {
      const spent = withCoupon({ maxRedemptions: 5, redeemedCount: 5 });

      await expect(spent.evaluate('WELCOME10', RIDER, 18_480)).rejects.toThrow(
        CouponExhaustedError,
      );
    });

    it('refuses a rider who has reached their own limit', async () => {
      await service.redeem({
        couponId: 'coupon_1',
        userId: RIDER,
        rideId: 'ride_1',
        amountPaisa: 1848,
      });

      await expect(
        service.evaluate('WELCOME10', RIDER, 18_480),
      ).rejects.toThrow(CouponAlreadyUsedError);
    });

    it('lets a rider use it again while under their limit', async () => {
      const twice = withCoupon({ perUserLimit: 2 });
      await twice.redeem({
        couponId: 'coupon_1',
        userId: RIDER,
        rideId: 'ride_1',
        amountPaisa: 1848,
      });

      await expect(
        twice.evaluate('WELCOME10', RIDER, 18_480),
      ).resolves.toBeDefined();
    });

    it('refuses a first-ride code to somebody who has ridden', async () => {
      const firstOnly = withCoupon({ firstRideOnly: true });
      coupons.ridden.add(RIDER);

      await expect(
        firstOnly.evaluate('WELCOME10', RIDER, 18_480),
      ).rejects.toThrow(CouponForFirstRideOnlyError);
    });

    it('allows a first-ride code to somebody who has not', async () => {
      const firstOnly = withCoupon({ firstRideOnly: true });

      await expect(
        firstOnly.evaluate('WELCOME10', RIDER, 18_480),
      ).resolves.toBeDefined();
    });
  });

  describe('redeem', () => {
    it('records the redemption and spends one from the budget', async () => {
      const limited = withCoupon({ maxRedemptions: 2 });

      expect(
        await limited.redeem({
          couponId: 'coupon_1',
          userId: RIDER,
          rideId: 'ride_1',
          amountPaisa: 1848,
        }),
      ).toBe(true);

      expect(coupons.rows[0]?.redeemedCount).toBe(1);
      expect(coupons.redemptions[0]?.amountPaisa).toBe(1848);
    });

    it('reports failure rather than throwing when the budget is gone', async () => {
      /* The ride is already being created by this point. Failing the booking
         to protect a marketing budget would cost the rider their ride. */
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const spent = withCoupon({ maxRedemptions: 1, redeemedCount: 1 });

      await expect(
        spent.redeem({
          couponId: 'coupon_1',
          userId: RIDER,
          rideId: 'ride_1',
          amountPaisa: 1848,
        }),
      ).resolves.toBe(false);

      jest.restoreAllMocks();
    });

    it('will not spend twice on one ride', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const twice = withCoupon({ perUserLimit: 5 });

      await twice.redeem({
        couponId: 'coupon_1',
        userId: RIDER,
        rideId: 'ride_1',
        amountPaisa: 1848,
      });

      expect(
        await twice.redeem({
          couponId: 'coupon_1',
          userId: RIDER,
          rideId: 'ride_1',
          amountPaisa: 1848,
        }),
      ).toBe(false);
      expect(coupons.rows[0]?.redeemedCount).toBe(1);

      jest.restoreAllMocks();
    });
  });
});
