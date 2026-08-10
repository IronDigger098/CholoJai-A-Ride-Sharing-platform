import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { NOTIFICATION_REPOSITORY } from './notification-repository.port';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PrismaNotificationRepository } from './prisma-notification.repository';

/**
 * In-app notifications.
 *
 * Depends on nothing but auth, deliberately. Notifications are raised *by*
 * rides and drivers, so anything this module imported from them would close
 * a cycle — which is also why delivery uses its own gateway namespace
 * rather than the tracking one, whose gateway needs the rides module.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
