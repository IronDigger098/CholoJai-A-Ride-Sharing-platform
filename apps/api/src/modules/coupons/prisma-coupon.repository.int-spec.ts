import {
  CouponKind,
  type FareOption,
  RideStatus,
  VehicleType,
  VEHICLE_TYPE_ORDER,
} from '@cholojai/shared';
/* No `describe` — this suite is wrapped in `describeWithDatabase`, which is
   `describe.skip` unless DATABASE_TEST_URL is set. */
import { beforeEach, expect, it } from '@jest/globals';

import {
  describeWithDatabase,
  useTestDatabase,
} from '../../testing/integration-database';

import { PrismaCouponRepository } from './prisma-coupon.repository';

/**
 * Redemption under real concurrency.
 *
 * The reason this file exists: `redeem` increments `redeemed_count` with
 * `max_redemptions` in the WHERE clause, so that two riders spending the last
 * redemption at the same moment produce exactly one winner. The in-memory
 * fake cannot show that — JavaScript runs one statement at a time, so the
 * fake is "atomic" for a reason that has nothing to do with the code being
 * tested. Every assertion below is about PostgreSQL's behaviour, not ours.
 *
 * The failure this guards against is not a crash. It is a campaign budgeted
 * for 100 rides quietly paying for 130, discovered a month later in a
 * spreadsheet.
 */

const FARE = {
  base: 5000,
  distance: 12_600,
  time: 880,
  discount: 0,
  total: 18_480,
};

const OPTIONS: FareOption[] = VEHICLE_TYPE_ORDER.map((vehicleType) => ({
  vehicleType,
  breakdown: FARE,
}));

describeWithDatabase('PrismaCouponRepository (real database)', () => {
  const database = useTestDatabase();
  let repository: PrismaCouponRepository;

  beforeEach(() => {
    repository = new PrismaCouponRepository(database());
  });

  async function createUser(email: string): Promise<string> {
    const user = await database().user.create({
      data: {
        email,
        fullName: 'Test Rider',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
      },
    });

    return user.id;
  }

  /** A ride to hang a redemption on. `ride_id` is unique, so one each. */
  async function createRide(riderId: string): Promise<string> {
    const quote = await database().fareQuote.create({
      data: {
        pickupLat: 23.7461,
        pickupLng: 90.376,
        pickupAddress: 'Dhanmondi 27',
        dropoffLat: 23.7936,
        dropoffLng: 90.4043,
        dropoffAddress: 'Banani 11',
        distanceM: 8400,
        durationS: 660,
        options: OPTIONS,
        expiresAt: new Date(Date.now() + 300_000),
      },
    });

    const ride = await database().ride.create({
      data: {
        riderId,
        fareQuoteId: quote.id,
        status: RideStatus.REQUESTED,
        vehicleType: VehicleType.CNG,
        pickupLat: 23.7461,
        pickupLng: 90.376,
        pickupAddress: 'Dhanmondi 27',
        dropoffLat: 23.7936,
        dropoffLng: 90.4043,
        dropoffAddress: 'Banani 11',
        distanceM: 8400,
        durationS: 660,
        fareBasePaisa: FARE.base,
        fareDistancePaisa: FARE.distance,
        fareTimePaisa: FARE.time,
        fareDiscountPaisa: FARE.discount,
        fareTotalPaisa: FARE.total,
      },
    });

    return ride.id;
  }

  async function createCoupon(maxRedemptions: number | null): Promise<string> {
    const coupon = await repository.create({
      code: 'WELCOME10',
      kind: CouponKind.PERCENT,
      value: 10,
      minFarePaisa: 0,
      perUserLimit: 10,
      firstRideOnly: false,
      startsAt: new Date(Date.now() - 60_000),
      ...(maxRedemptions === null ? {} : { maxRedemptions }),
    });

    return coupon.id;
  }

  async function redeemedCountOf(couponId: string): Promise<number> {
    const coupon = await database().coupon.findUniqueOrThrow({
      where: { id: couponId },
      select: { redeemedCount: true },
    });

    return coupon.redeemedCount;
  }

  it('records the redemption and spends one from the budget', async () => {
    const couponId = await createCoupon(5);
    const riderId = await createUser('rider@cholojai.test');
    const rideId = await createRide(riderId);

    const spent = await repository.redeem({
      couponId,
      userId: riderId,
      rideId,
      amountPaisa: 1848,
    });

    expect(spent).toBe(true);
    expect(await redeemedCountOf(couponId)).toBe(1);
    expect(await repository.countRedemptionsBy(couponId, riderId)).toBe(1);
  });

  it('lets exactly one of two riders take the last redemption', async () => {
    /* The property the conditional UPDATE exists for, and the one a fake
       cannot demonstrate. Both transactions read a budget with one left;
       PostgreSQL serialises the two UPDATEs, and the second re-evaluates
       `redeemed_count < max_redemptions` after taking the row lock — by
       which time it is false. */
    const couponId = await createCoupon(1);
    const firstRider = await createUser('first@cholojai.test');
    const secondRider = await createUser('second@cholojai.test');
    const firstRide = await createRide(firstRider);
    const secondRide = await createRide(secondRider);

    const results = await Promise.all([
      repository.redeem({
        couponId,
        userId: firstRider,
        rideId: firstRide,
        amountPaisa: 1848,
      }),
      repository.redeem({
        couponId,
        userId: secondRider,
        rideId: secondRide,
        amountPaisa: 1848,
      }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await redeemedCountOf(couponId)).toBe(1);
    expect(await database().couponRedemption.count()).toBe(1);
  });

  it('never lets a budget of one become two, however many race for it', async () => {
    /* Two is the smallest race and can pass by luck. Eight cannot: any
       missing lock shows up as a count above one. */
    const couponId = await createCoupon(1);

    const riders = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createUser(`rider${index}@cholojai.test`),
      ),
    );
    const rides = await Promise.all(riders.map((id) => createRide(id)));

    const results = await Promise.all(
      riders.map((userId, index) =>
        repository.redeem({
          couponId,
          userId,
          rideId: rides[index] ?? '',
          amountPaisa: 1848,
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await redeemedCountOf(couponId)).toBe(1);
  });

  it('spends the whole budget and no more', async () => {
    /* Five redemptions, ten riders, all at once. The budget decides the
       answer rather than the ordering. */
    const couponId = await createCoupon(5);

    const riders = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        createUser(`rider${index}@cholojai.test`),
      ),
    );
    const rides = await Promise.all(riders.map((id) => createRide(id)));

    const results = await Promise.all(
      riders.map((userId, index) =>
        repository.redeem({
          couponId,
          userId,
          rideId: rides[index] ?? '',
          amountPaisa: 1848,
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await redeemedCountOf(couponId)).toBe(5);
    expect(await database().couponRedemption.count()).toBe(5);
  });

  it('leaves no redemption row behind when the budget refuses', async () => {
    /* The increment and the insert are one transaction. If the refusal
       returned before the insert but after some earlier write, a campaign
       would show redemptions it never paid for. */
    const couponId = await createCoupon(1);
    const firstRider = await createUser('first@cholojai.test');
    const secondRider = await createUser('second@cholojai.test');

    await repository.redeem({
      couponId,
      userId: firstRider,
      rideId: await createRide(firstRider),
      amountPaisa: 1848,
    });

    const spent = await repository.redeem({
      couponId,
      userId: secondRider,
      rideId: await createRide(secondRider),
      amountPaisa: 1848,
    });

    expect(spent).toBe(false);
    expect(await database().couponRedemption.count()).toBe(1);
    expect(await repository.countRedemptionsBy(couponId, secondRider)).toBe(0);
  });

  it('reports a repeated redemption of one ride as false, not an error', async () => {
    /* `ride_id` is unique. A retry that already succeeded reports false
       rather than raising: the caller's intent — this ride has spent this
       coupon — is already true, and booking must not fail on a retry. */
    const couponId = await createCoupon(null);
    const riderId = await createUser('rider@cholojai.test');
    const rideId = await createRide(riderId);

    await repository.redeem({
      couponId,
      userId: riderId,
      rideId,
      amountPaisa: 1848,
    });

    const again = await repository.redeem({
      couponId,
      userId: riderId,
      rideId,
      amountPaisa: 1848,
    });

    expect(again).toBe(false);
    expect(await database().couponRedemption.count()).toBe(1);
  });

  it('refuses a retired campaign even with budget remaining', async () => {
    /* `is_active` is in the same WHERE clause as the budget, so retiring a
       campaign stops redemption at the database rather than relying on
       every caller to have checked first. */
    const couponId = await createCoupon(5);
    await repository.update(couponId, { isActive: false });

    const riderId = await createUser('rider@cholojai.test');

    const spent = await repository.redeem({
      couponId,
      userId: riderId,
      rideId: await createRide(riderId),
      amountPaisa: 1848,
    });

    expect(spent).toBe(false);
    expect(await redeemedCountOf(couponId)).toBe(0);
  });

  it('does not cap a campaign with no budget', async () => {
    /* Null `max_redemptions` means unlimited. A comparison against NULL is
       NULL rather than true, so the clause is written to allow it
       explicitly — get that wrong and every uncapped campaign refuses
       everybody. */
    const couponId = await createCoupon(null);

    const riders = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        createUser(`rider${index}@cholojai.test`),
      ),
    );
    const rides = await Promise.all(riders.map((id) => createRide(id)));

    const results = await Promise.all(
      riders.map((userId, index) =>
        repository.redeem({
          couponId,
          userId,
          rideId: rides[index] ?? '',
          amountPaisa: 1848,
        }),
      ),
    );

    expect(results.every(Boolean)).toBe(true);
    expect(await redeemedCountOf(couponId)).toBe(4);
  });
});
