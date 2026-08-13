import { z } from 'zod';

import { NotificationKind } from './notifications.contracts';

/**
 * Account settings — `docs/roadmap.md` M10b.
 *
 * Three unrelated things a rider changes about themselves: who they are,
 * how they sign in, and what they hear about. They share a screen because
 * that is where people look for them, not because they share a model — each
 * is its own endpoint with its own rules.
 */

/**
 * Editing a profile.
 *
 * Email is absent. Changing it means re-verifying it, which is a flow with
 * its own tokens and its own failure modes (the old address must stay valid
 * until the new one is proven), and pretending it is a field on this form
 * would ship an account-takeover vector as a convenience.
 *
 * Every field is optional, and sending none is a valid request that changes
 * nothing. `PATCH` means "here is what differs", so a client that only
 * knows about `fullName` must not blank a phone number it never rendered.
 */
export const updateProfileRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  /**
   * Bangladeshi mobile numbers. Nullable as well as optional, because
   * "remove my number" and "leave it alone" are different requests and a
   * single optional field cannot say both.
   */
  phone: z
    .string()
    .trim()
    .regex(/^01[3-9]\d{8}$/u, 'Enter an 11-digit number starting 01')
    .nullable()
    .optional(),
  avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
});

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/**
 * Changing a password while signed in.
 *
 * The current password is required even though the caller already holds a
 * valid token. A token can be a borrowed laptop; the current password is
 * the thing only the account holder knows, and this is the one operation
 * that would let a borrowed session lock the owner out permanently.
 */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(200)
    .regex(/[a-z]/u, 'Include a lowercase letter')
    .regex(/[A-Z]/u, 'Include an uppercase letter')
    .regex(/\d/u, 'Include a number'),
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/**
 * Which notification categories are switched off.
 *
 * The wire shape is the list of muted kinds rather than a map of booleans,
 * mirroring the table: only the exceptions are named. A kind added next
 * year is absent from every stored list and is therefore on, which is what
 * we want — a rider cannot have opted out of something that did not exist.
 */
export const notificationSettingsSchema = z.object({
  muted: z.array(z.nativeEnum(NotificationKind)),
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsRequestSchema =
  notificationSettingsSchema;

export type UpdateNotificationSettingsRequest = NotificationSettings;

/**
 * Which categories a rider can actually turn off.
 *
 * Not every kind is here. Ride events are how somebody learns their driver
 * is outside; muting those would produce a rider who thinks the app is
 * broken. Only the categories where silence is a preference rather than a
 * failure are offered — and the API enforces the same list, so a crafted
 * request cannot mute what the screen does not show.
 */
export const MUTABLE_NOTIFICATION_KINDS: readonly NotificationKind[] = [
  NotificationKind.DRIVER_APPLICATION_APPROVED,
  NotificationKind.DRIVER_APPLICATION_REJECTED,
];

/** What each mutable category is called on the settings screen. */
export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  [NotificationKind.RIDE_ACCEPTED]: 'A driver accepts your ride',
  [NotificationKind.RIDE_COMPLETED]: 'A ride finishes',
  [NotificationKind.RIDE_CANCELLED]: 'A ride is cancelled',
  [NotificationKind.DRIVER_APPLICATION_APPROVED]:
    'Your driver application is approved',
  [NotificationKind.DRIVER_APPLICATION_REJECTED]:
    'Your driver application is rejected',
};
