import { RideStatus } from '@cholojai/shared';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { InMemoryReviewRepository } from '../../testing/in-memory-review.repository';
import { type DriversService } from '../drivers/drivers.service';
import { RideNotFoundError } from '../rides/rides.errors';
import { type RidesService } from '../rides/rides.service';

import {
  AlreadyRatedError,
  NobodyToRateError,
  RideNotFinishedError,
} from './reviews.errors';
import { ReviewsService } from './reviews.service';

const RIDER = 'user_rider_1';
const DRIVER_USER = 'user_driver_1';
const DRIVER_PROFILE = 'driver_1';
const RIDE = 'ride_1';

/**
 * Only `findParticipants` is reachable from this service.
 *
 * It throws for a ride that is not the caller's, exactly as the real one
 * does — that refusal is the authorisation rule these tests care about, so
 * a fake that answered anyway would test nothing.
 */
function makeRides(
  status: RideStatus = RideStatus.COMPLETED,
  driverProfileId: string | null = DRIVER_PROFILE,
): RidesService {
  return {
    findParticipants: (riderId: string, rideId: string) =>
      riderId === RIDER && rideId === RIDE
        ? Promise.resolve({ status, driverProfileId })
        : Promise.reject(new RideNotFoundError(rideId)),
  } as unknown as RidesService;
}

function makeDrivers(userId: string | null = DRIVER_USER): DriversService {
  return {
    findUserId: () => Promise.resolve(userId),
  } as unknown as DriversService;
}

describe('ReviewsService', () => {
  let reviews: InMemoryReviewRepository;

  beforeEach(() => {
    reviews = new InMemoryReviewRepository();
  });

  function makeService(
    rides: RidesService = makeRides(),
    drivers: DriversService = makeDrivers(),
  ): ReviewsService {
    return new ReviewsService(reviews, rides, drivers);
  }

  describe('submit', () => {
    it('stores a rating against the ride', async () => {
      const review = await makeService().submit(RIDER, RIDE, { rating: 5 });

      expect(review.rating).toBe(5);
      expect(review.rideId).toBe(RIDE);
      expect(review.comment).toBeNull();
    });

    it('rates the driver, not the driver profile', async () => {
      /* The review targets an account. The day a driver rates a rider, both
         directions live in one table, and a foreign key that points at a
         profile in one row and an account in the next is not one. */
      await makeService().submit(RIDER, RIDE, { rating: 4 });

      expect(reviews.rows[0]?.targetId).toBe(DRIVER_USER);
      expect(reviews.rows[0]?.authorId).toBe(RIDER);
    });

    it('refuses a ride that has not finished', async () => {
      const service = makeService(makeRides(RideStatus.IN_PROGRESS));

      await expect(service.submit(RIDER, RIDE, { rating: 5 })).rejects.toThrow(
        RideNotFinishedError,
      );
    });

    it('refuses a ride that never had a driver', async () => {
      /* Cancelled before anyone accepted, or expired. Distinct from "not
         finished" because one is worth waiting for and the other never
         will be. */
      const service = makeService(makeRides(RideStatus.COMPLETED, null));

      await expect(service.submit(RIDER, RIDE, { rating: 5 })).rejects.toThrow(
        NobodyToRateError,
      );
    });

    it('refuses a ride belonging to somebody else', async () => {
      /* 404, not 403. A 403 would confirm that a guessed ride id is real. */
      const service = makeService();

      await expect(
        service.submit('user_stranger', RIDE, { rating: 1 }),
      ).rejects.toThrow(RideNotFoundError);
    });

    it('refuses a second rating of the same ride', async () => {
      const service = makeService();
      await service.submit(RIDER, RIDE, { rating: 5 });

      await expect(service.submit(RIDER, RIDE, { rating: 1 })).rejects.toThrow(
        AlreadyRatedError,
      );
    });

    it('keeps a comment when one is given', async () => {
      const review = await makeService().submit(RIDER, RIDE, {
        rating: 2,
        comment: 'Took a long way round.',
      });

      expect(review.comment).toBe('Took a long way round.');
    });
  });

  describe('findMine', () => {
    it('is null before the rider has rated', async () => {
      expect(await makeService().findMine(RIDER, RIDE)).toBeNull();
    });

    it('returns the rating once left', async () => {
      const service = makeService();
      await service.submit(RIDER, RIDE, { rating: 3 });

      expect((await service.findMine(RIDER, RIDE))?.rating).toBe(3);
    });

    it('checks the ride is the caller’s before answering', async () => {
      /* Otherwise this endpoint tells a stranger that a ride id is real by
         answering `null` instead of 404. */
      await expect(
        makeService().findMine('user_stranger', RIDE),
      ).rejects.toThrow(RideNotFoundError);
    });
  });
});
