import { Module } from '@nestjs/common';

import { PasswordHasherService } from '../../common/security/password-hasher.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

import { NOTIFICATION_MUTE_REPOSITORY } from './notification-mute-repository.port';
import { PrismaNotificationMuteRepository } from './prisma-notification-mute.repository';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * A person's own account settings.
 *
 * Separate from `AdminModule` on purpose, even though both edit users. The
 * two differ in exactly the way that matters: this one can only ever act on
 * the caller, and that is enforced by the shape of its routes rather than
 * by a check somebody could forget. Merging them would put "edit anyone"
 * and "edit yourself" one parameter apart.
 *
 * Exports the mute repository so `NotificationsModule` can ask whether a
 * category is silenced before sending — the only thing outside this module
 * that needs any of it.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    PasswordHasherService,
    {
      provide: NOTIFICATION_MUTE_REPOSITORY,
      useClass: PrismaNotificationMuteRepository,
    },
  ],
  exports: [SettingsService, NOTIFICATION_MUTE_REPOSITORY],
})
export class SettingsModule {}
