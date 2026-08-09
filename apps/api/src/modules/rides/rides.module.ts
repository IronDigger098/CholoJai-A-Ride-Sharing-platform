import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FaresModule } from '../fares/fares.module';

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
  imports: [AuthModule, FaresModule],
  controllers: [RidesController],
  providers: [
    RidesService,
    { provide: RIDE_REPOSITORY, useClass: PrismaRideRepository },
  ],
  exports: [RidesService],
})
export class RidesModule {}
