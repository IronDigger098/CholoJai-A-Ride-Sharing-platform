import {
  type CreateReviewRequest,
  type Review,
  RideStatus,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import { DriversService } from '../drivers/drivers.service';
import { RidesService } from '../rides/rides.service';

import {
  REVIEW_REPOSITORY,
  type ReviewRecord,
  type ReviewRepository,
} from './review-repository.port';
import { NobodyToRateError, RideNotFinishedError } from './reviews.errors';

/**
 * Rating a completed ride.
 *
 * Three questions, asked of the modules that own the answers rather than of
 * their tables: was this rider on this ride and did it finish (rides), which
 * account drove it (drivers), and has this ride already been rated (the
 * unique index, which answers by refusing).
 */
@Injectable()
export class ReviewsService {
  public constructor(
    @Inject(REVIEW_REPOSITORY) private readonly reviews: ReviewRepository,
    private readonly rides: RidesService,
    private readonly drivers: DriversService,
  ) {}

  public async submit(
    riderId: string,
    rideId: string,
    request: CreateReviewRequest,
  ): Promise<Review> {
    /* Throws 404 if the ride is not this rider's — the same rule as
       cancelling, so a stranger cannot learn which ride ids are real by
       rating them. */
    const ride = await this.rides.findParticipants(riderId, rideId);

    if (ride.status !== RideStatus.COMPLETED) {
      throw new RideNotFinishedError(ride.status);
    }

    if (ride.driverProfileId === null) {
      throw new NobodyToRateError();
    }

    const targetId = await this.drivers.findUserId(ride.driverProfileId);

    /* A completed ride always has a driver, and that driver always has an
       account. Treated as "nobody to rate" rather than asserted, because
       the alternative to a 409 here is a 500 on a row that turned out to be
       stranger than expected. */
    if (targetId === null) {
      throw new NobodyToRateError();
    }

    const review = await this.reviews.create({
      rideId,
      authorId: riderId,
      targetId,
      rating: request.rating,
      ...(request.comment === undefined ? {} : { comment: request.comment }),
    });

    return toReview(review);
  }

  /** The caller's own rating of a ride, or null if they have not left one. */
  public async findMine(
    riderId: string,
    rideId: string,
  ): Promise<Review | null> {
    /* The ownership check first, so this cannot be used to discover that a
       ride exists by asking whether it has been rated. */
    await this.rides.findParticipants(riderId, rideId);

    const review = await this.reviews.findByRideAndAuthor(rideId, riderId);

    return review === null ? null : toReview(review);
  }
}

function toReview(record: ReviewRecord): Review {
  return {
    id: record.id,
    rideId: record.rideId,
    rating: record.rating,
    comment: record.comment,
    createdAt: record.createdAt.toISOString(),
  };
}
