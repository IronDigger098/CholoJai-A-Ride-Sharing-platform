import {
  changePasswordRequestSchema,
  notificationSettingsSchema,
  updateNotificationSettingsRequestSchema,
  updateProfileRequestSchema,
  userSummarySchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

/** The settings surface, typed from the shared contracts. */

export class UpdateProfileRequestDto extends createZodDto(
  updateProfileRequestSchema,
) {}

export class ChangePasswordRequestDto extends createZodDto(
  changePasswordRequestSchema,
) {}

export class NotificationSettingsDto extends createZodDto(
  notificationSettingsSchema,
) {}

export class UpdateNotificationSettingsRequestDto extends createZodDto(
  updateNotificationSettingsRequestSchema,
) {}

export class UserSummaryDto extends createZodDto(userSummarySchema) {}
