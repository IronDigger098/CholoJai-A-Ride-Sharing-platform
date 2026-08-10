import { type NotificationKind } from '@cholojai/shared';

/** What the notifications feature needs from persistence. */

export interface CreateNotificationInput {
  readonly userId: string;
  readonly kind: NotificationKind;
  /** The wording, written now. Templates change; what someone read does not. */
  readonly title: string;
  readonly body: string;
  readonly href?: string | undefined;
}

export interface NotificationRecord {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly href: string | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface NotificationPageRecord {
  readonly notifications: readonly NotificationRecord[];
  readonly hasNextPage: boolean;
}

export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;

  listForUser(
    userId: string,
    page: { readonly limit: number; readonly cursor?: string | undefined },
  ): Promise<NotificationPageRecord>;

  /**
   * How many are unread, across everything.
   *
   * Counted rather than derived from a page: the badge has to mean "unread
   * notifications", not "unread notifications on the page you happen to be
   * looking at".
   */
  countUnread(userId: string): Promise<number>;

  /**
   * Mark one read. Returns null when it is not this user's.
   *
   * The user id is part of the write, not checked before it — otherwise the
   * check and the update are two statements and the gap between them is
   * exactly where a wrong row gets touched.
   */
  markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationRecord | null>;

  /** Mark every unread one read. Returns how many changed. */
  markAllRead(userId: string): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
