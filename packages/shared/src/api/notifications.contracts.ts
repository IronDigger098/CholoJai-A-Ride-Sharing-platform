import { z } from 'zod';

import { cursorPageQuerySchema, pageInfoSchema } from './pagination.contracts';

/**
 * In-app notifications — `docs/roadmap.md` M9.
 *
 * Stored, unlike a driver's live position (D4). A position matters only
 * while the ride is happening; "your application was approved" matters
 * whenever the driver next opens the app, which may be tomorrow.
 */

/**
 * What a notification is about.
 *
 * The category, not the wording. Clients group and filter on this; the
 * sentence a user reads is stored on the row, written when the event
 * happened, so rewording a template later cannot rewrite what someone was
 * already told.
 */
export const NotificationKind = {
  RIDE_ACCEPTED: 'RIDE_ACCEPTED',
  RIDE_COMPLETED: 'RIDE_COMPLETED',
  RIDE_CANCELLED: 'RIDE_CANCELLED',
  DRIVER_APPLICATION_APPROVED: 'DRIVER_APPLICATION_APPROVED',
  DRIVER_APPLICATION_REJECTED: 'DRIVER_APPLICATION_REJECTED',
} as const;

export type NotificationKind =
  (typeof NotificationKind)[keyof typeof NotificationKind];

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.nativeEnum(NotificationKind),
  title: z.string(),
  body: z.string(),
  /** Where tapping it leads. Null when there is nowhere to go. */
  href: z.string().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = cursorPageQuerySchema;

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

/**
 * A page of notifications, with the unread count alongside.
 *
 * The count is not derivable from the page — it counts unread notifications
 * everywhere, including on pages the client has not asked for. Sending it
 * here rather than from a second endpoint means the badge and the list can
 * never disagree, because they arrived in the same response.
 */
export const notificationPageSchema = z.object({
  data: z.array(notificationSchema),
  pageInfo: pageInfoSchema,
  unreadCount: z.number().int().nonnegative(),
});

export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const notificationIdParamSchema = z.object({
  notificationId: z.string().min(1).max(64),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;

/** How many are unread, for a client that wants only the badge. */
export const unreadCountSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
});

export type UnreadCount = z.infer<typeof unreadCountSchema>;

/**
 * Socket events, in one place so both sides cannot misspell them.
 *
 * Delivery reuses the connection M7 opened for tracking. A second socket
 * would mean a second handshake, a second token check, and a second thing
 * to reconnect — for a message that arrives a few times a day.
 */
export const NOTIFICATION_EVENTS = {
  /** server → the recipient's own room */
  created: 'notification:created',
} as const;
