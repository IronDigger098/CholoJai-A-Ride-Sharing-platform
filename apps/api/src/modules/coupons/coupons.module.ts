import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { COUPON_REPOSITORY } from './coupon-repository.port';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { PrismaCouponRepository } from './prisma-coupon.repository';

/**
 * Discount campaigns.
 *
 * Depends on nothing but auth. Fares asks it to price a code and rides asks
 * it to spend one, so anything it imported from either would close a cycle —
 * which is also why "has this rider finished a ride" is answered by the
 * adapter rather than by asking `RidesService`.
 *
 * The admin routes live here rather than in `AdminModule`, mounted under
 * `admin/coupons`. The URL says where they sit in the API; the module says
 * who owns the rules behind them.
 */
@Module({
  imports: [AuthModule],
  controllers: [CouponsController],
  providers: [
    CouponsService,
    { provide: COUPON_REPOSITORY, useClass: PrismaCouponRepository },
  ],
  exports: [CouponsService],
})
export class CouponsModule {}
