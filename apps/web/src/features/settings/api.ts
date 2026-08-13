import {
  type ChangePasswordRequest,
  type NotificationSettings,
  notificationSettingsSchema,
  type UpdateNotificationSettingsRequest,
  type UpdateProfileRequest,
  type UserSummary,
  userSummarySchema,
} from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

/** Settings calls. Every response is parsed against the shared contract. */

export async function updateProfile(
  request: UpdateProfileRequest,
): Promise<UserSummary> {
  const response = await apiClient.patch('/settings/profile', request);

  return userSummarySchema.parse(response.data);
}

/**
 * Change a password. Returns nothing, and ends every session.
 *
 * The caller is signed out by the time this resolves — the refresh token it
 * would use next has been revoked. That is deliberate on the server, so the
 * screen's job is to say so rather than to act surprised.
 */
export async function changePassword(
  request: ChangePasswordRequest,
): Promise<void> {
  await apiClient.post('/settings/password', request);
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const response = await apiClient.get('/settings/notifications');

  return notificationSettingsSchema.parse(response.data);
}

export async function updateNotificationSettings(
  request: UpdateNotificationSettingsRequest,
): Promise<NotificationSettings> {
  const response = await apiClient.put('/settings/notifications', request);

  return notificationSettingsSchema.parse(response.data);
}
