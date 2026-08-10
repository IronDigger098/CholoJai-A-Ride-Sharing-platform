import {
  DriverApplicationStatus,
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

import { PrismaReviewRepository } from './prisma-review.repository';
import { AlreadyRatedError } from './reviews.errors';

/**
 * The rating rollup, against a real database.
 *
 * This is the half of the reviews feature the in-memory fake deliberately
 * does not reproduce: one transaction writing a row to `reviews` and
 * recomputing a cached average on `driver_profiles`. A fake asserting it
 * would only prove the fake agrees with itself.
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

describeWithDatabase('PrismaReviewRepository (real database)', () => {
  const database = useTestDatabase();
  let repository: PrismaReviewRepository;

  beforeEach(() => {
    repository = new PrismaReviewRepository(database());
  });

  async function createUser(email: string, fullName: string): Promise<string> {
    const user = await database().user.create({
      data: {
        email,
        fullName,
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$salt$hash',
      },
    });

    return user.id;
  }

  /** An approved driver, because only those have a rating to refresh. */
  async function createDriver(): Promise<string> {
    const userId = await createUser('driver@cholojai.test', 'Test Driver');

    await database().driverProfile.create({
      data: {
        userId,
        licenseNoMasked: '••••7890',
        applicationStatus: DriverApplicationStatus.APPROVED,
        approvedAt: new Date(),
      },
    });

    return userId;
  }

  /** A completed ride. Several are needed: one rating each. */
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
        status: RideStatus.COMPLETED,
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
        completedAt: new Date(),
      },
    });

    return ride.id;
  }

  async function ratingOf(userId: string): Promise<{
    ratingAvgX100: number;
    ratingCount: number;
  }> {
    const profile = await database().driverProfile.findUniqueOrThrow({
      where: { userId },
      select: { ratingAvgX100: true, ratingCount: true },
    });

    return profile;
  }

  it('stores the rating and its comment', async () => {
    const riderId = await createUser('rider@cholojai.test', 'Test Rider');
    const targetId = await createDriver();
    const rideId = await createRide(riderId);

    const review = await repository.create({
      rideId,
      authorId: riderId,
      targetId,
      rating: 5,
      comment: 'Arrived early.',
    });

    expect(review.rating).toBe(5);
    expect(review.comment).toBe('Arrived early.');
  });

  it('refreshes the driver’s average in the same write', async () => {
    const riderId = await createUser('rider@cholojai.test', 'Test Rider');
    const targetId = await createDriver();
    const rideId = await createRide(riderId);

    await repository.create({ rideId, authorId: riderId, targetId, rating: 4 });

    expect(await ratingOf(targetId)).toEqual({
      ratingAvgX100: 400,
      ratingCount: 1,
    });
  });

  it('recomputes rather than folds, so rounding cannot drift', async () => {
    /* 5, 4, 4 averages 4.333…, which is 433 in hundredths. Folding each
       new rating into a stored average would round three times instead of
       once, and the error would compound with every rating after it. */
    const riderId = await createUser('rider@cholojai.test', 'Test Rider');
    const targetId = await createDriver();

    for (const rating of [5, 4, 4]) {
      await repository.create({
        rideId: await createRide(riderId),
        authorId: riderId,
        targetId,
        rating,
      });
    }

    expect(await ratingOf(targetId)).toEqual({
      ratingAvgX100: 433,
      ratingCount: 3,
    });
  });

  it('refuses a second rating of the same ride by the same rider', async () => {
    /* The `(ride_id, author_id)` index. Two taps on a slow connection both
       pass a read-then-write check, and the driver's average counts one
       journey twice. */
    const riderId = await createUser('rider@cholojai.test', 'Test Rider');
    const targetId = await createDriver();
    const rideId = await createRide(riderId);

    await repository.create({ rideId, authorId: riderId, targetId, rating: 5 });

    await expect(
      repository.create({ rideId, authorId: riderId, targetId, rating: 1 }),
    ).rejects.toThrow(AlreadyRatedError);
  });

  it('leaves the rating unchanged after a refused duplicate', async () => {
    /* The transaction rolls back as a whole. A partial failure that kept
       the refreshed average would be worse than either outcome. */
    const riderId = await createUser('rider@cholojai.test', 'Test Rider');
    const targetId = await createDriver();
    const rideId = await createRide(riderId);

    await repository.create({ rideId, authorId: riderId, targetId, rating: 5 });
    await repository
      .create({ rideId, authorId: riderId, targetId, rating: 1 })
      .catch(() => undefined);

    expect(await ratingOf(targetId)).toEqual({
      ratingAvgX100: 500,
      ratingCount: 1,
    });
  });

  it('stores a rating for a target who has no driver profile', async () => {
    /* The day a driver rates a rider. `updateMany` matching nothing has to
       be nothing happening, not an exception. */
    const riderId = await createUser('rider@cholojai.test', 'Test Rider');
    const targetId = await createUser('other@cholojai.test', 'No Profile');
    const rideId = await createRide(riderId);

    const review = await repository.create({
      rideId,
      authorId: riderId,
      targetId,
      rating: 3,
    });

    expect(review.rating).toBe(3);
  });

  it('finds a rating by its ride and author', async () => {
    const riderId = await createUser('rider@cholojai.test', 'Test Rider');
    const targetId = await createDriver();
    const rideId = await createRide(riderId);
    await repository.create({ rideId, authorId: riderId, targetId, rating: 2 });

    const found = await repository.findByRideAndAuthor(rideId, riderId);

    expect(found?.rating).toBe(2);
  });

  it('is null when the rider has not rated that ride', async () => {
    const riderId = await createUser('rider@cholojai.test', 'Test Rider');
    const rideId = await createRide(riderId);

    expect(await repository.findByRideAndAuthor(rideId, riderId)).toBeNull();
  });
});
