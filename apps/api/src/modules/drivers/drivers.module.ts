import { Module } from '@nestjs/common';

import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { DriverApplicationsController } from './driver-applications.controller';
import { DRIVER_PROFILE_REPOSITORY } from './driver-profile-repository.port';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { PrismaDriverProfileRepository } from './prisma-driver-profile.repository';

/**
 * Driver applications and their review.
 *
 * Imports `AdminModule` for `grantRole`, so approval is one operation rather
 * than a controller orchestrating two services and hoping both land. The
 * dependency runs one way — admin knows nothing about drivers — which is why
 * the `/admin/driver-applications` controller lives here rather than there.
 *
 * `DriversService` is exported because M7's ride-acceptance flow needs to
 * resolve a signed-in user to an approved driver profile before it can let
 * them accept anything.
 */
@Module({
  imports: [AuthModule, AdminModule, NotificationsModule],
  controllers: [DriversController, DriverApplicationsController],
  providers: [
    DriversService,
    {
      provide: DRIVER_PROFILE_REPOSITORY,
      useClass: PrismaDriverProfileRepository,
    },
  ],
  exports: [DriversService, DRIVER_PROFILE_REPOSITORY],
})
export class DriversModule {}
