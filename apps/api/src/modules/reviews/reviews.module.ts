import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DriversModule } from '../drivers/drivers.module';
import { RidesModule } from '../rides/rides.module';

import { PrismaReviewRepository } from './prisma-review.repository';
import { REVIEW_REPOSITORY } from './review-repository.port';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/**
 * Ride ratings.
 *
 * Imports the two modules that own the facts it needs: `RidesModule` says
 * whether a ride finished and who drove it, `DriversModule` turns that
 * driver profile into an account. Neither table is touched from here — the
 * same rule that keeps `RidesModule` out of the vehicles tables.
 */
@Module({
  imports: [AuthModule, RidesModule, DriversModule],
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    { provide: REVIEW_REPOSITORY, useClass: PrismaReviewRepository },
  ],
})
export class ReviewsModule {}
