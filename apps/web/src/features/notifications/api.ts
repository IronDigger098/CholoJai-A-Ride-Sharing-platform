import {
  type Notification,
  type NotificationListQuery,
  type NotificationPage,
  notificationPageSchema,
  notificationSchema,
} from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

export async function listNotifications(
  query: NotificationListQuery,
): Promise<NotificationPage> {
  const response = await apiClient.get('/notifications', { params: query });

  return notificationPageSchema.parse(response.data);
}

export async function markNotificationRead(
  notificationId: string,
): Promise<Notification> {
  const response = await apiClient.patch(
    `/notifications/${notificationId}/read`,
  );

  return notificationSchema.parse(response.data);
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.patch('/notifications/read');
}
