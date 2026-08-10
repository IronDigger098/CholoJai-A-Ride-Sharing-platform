import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DriversModule } from '../drivers/drivers.module';

import { PrismaVehicleRepository } from './prisma-vehicle.repository';
import { VEHICLE_REPOSITORY } from './vehicle-repository.port';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

/**
 * Vehicle management.
 *
 * Imports `DriversModule` for its service, not its repository: resolving a
 * user to an approved driver is the drivers module's rule to enforce, and
 * reaching for the profile table here would put that rule in two places.
 *
 * Exported because M7's acceptance flow needs the driver's active vehicle
 * to attach to a ride.
 */
@Module({
  imports: [AuthModule, DriversModule],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    { provide: VEHICLE_REPOSITORY, useClass: PrismaVehicleRepository },
  ],
  exports: [VehiclesService, VEHICLE_REPOSITORY],
})
export class VehiclesModule {}
