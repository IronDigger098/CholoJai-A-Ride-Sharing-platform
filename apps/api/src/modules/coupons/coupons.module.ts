import { Module } from '@nestjs/common';

import { COUPON_REPOSITORY } from './coupon-repository.port';
import { CouponsService } from './coupons.service';
import { PrismaCouponRepository } from './prisma-coupon.repository';

/**
 * Discount campaigns.
 *
 * Depends on nothing. Fares asks it to price a code and rides asks it to
 * spend one, so anything it imported from either would close a cycle — which
 * is also why "has this rider finished a ride" is answered by the adapter
 * rather than by asking `RidesService`.
 *
 * No controller here: the admin endpoints live in the admin surface and are
 * added in the next slice.
 */
@Module({
  providers: [
    CouponsService,
    { provide: COUPON_REPOSITORY, useClass: PrismaCouponRepository },
  ],
  exports: [CouponsService],
})
export class CouponsModule {}
