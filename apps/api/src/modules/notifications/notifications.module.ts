import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';

import { NOTIFICATION_REPOSITORY } from './notification-repository.port';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PrismaNotificationRepository } from './prisma-notification.repository';

/**
 * In-app notifications.
 *
 * Depends on auth and settings, deliberately not on rides or drivers.
 * Notifications are raised *by* those, so anything imported from them would
 * close a cycle — which is also why delivery uses its own gateway namespace
 * rather than the tracking one, whose gateway needs the rides module.
 *
 * Settings is safe in that direction: it knows which categories a person
 * has silenced and knows nothing about notifications being sent. The
 * dependency runs one way, from the sender to the preference.
 */
@Module({
  imports: [AuthModule, SettingsModule],
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
