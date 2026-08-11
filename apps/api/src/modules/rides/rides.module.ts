import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CouponsModule } from '../coupons/coupons.module';
import { DriversModule } from '../drivers/drivers.module';
import { FaresModule } from '../fares/fares.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VehiclesModule } from '../vehicles/vehicles.module';

import { PrismaRideRepository } from './prisma-ride.repository';
import { RIDE_REPOSITORY } from './ride-repository.port';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';

/**
 * Rides.
 *
 * Imports `FaresModule` for the quote repository rather than the fares
 * service: booking reads a stored offer by id, it never asks for a new
 * price. Depending on the service would let a future change re-quote at
 * booking time, which is exactly what D2's snapshot rule exists to prevent.
 */
@Module({
  /* VehiclesModule answers "who is this driver and what are they driving",
     including the approval check it delegates to drivers — that is still
     the only way dispatch asks the question.

     DriversModule arrives alongside it for the opposite direction, and one
     use: turning a driver profile back into an account, so a cancelled ride
     can notify the driver who was on their way to it. Two imports, two
     distinct questions; neither is a second route to the other. */
  imports: [
    AuthModule,
    FaresModule,
    VehiclesModule,
    DriversModule,
    NotificationsModule,
    /* To spend a code, never to price one. Fares imports it for the other
       half; the two directions do not meet, so there is no cycle. */
    CouponsModule,
  ],
  controllers: [RidesController],
  providers: [
    RidesService,
    { provide: RIDE_REPOSITORY, useClass: PrismaRideRepository },
  ],
  exports: [RidesService],
})
export class RidesModule {}
