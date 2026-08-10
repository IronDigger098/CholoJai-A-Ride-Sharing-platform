import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationPageSchema,
  notificationSchema,
  unreadCountSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class NotificationListQueryDto extends createZodDto(
  notificationListQuerySchema,
) {}

export class NotificationPageDto extends createZodDto(notificationPageSchema) {}

export class NotificationDto extends createZodDto(notificationSchema) {}

export class NotificationIdParamDto extends createZodDto(
  notificationIdParamSchema,
) {}

export class UnreadCountDto extends createZodDto(unreadCountSchema) {}
