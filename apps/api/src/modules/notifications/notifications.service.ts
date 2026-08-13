import {
  type Notification,
  type NotificationKind,
  type NotificationListQuery,
  type NotificationPage,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  NOTIFICATION_MUTE_REPOSITORY,
  type NotificationMuteRepository,
} from '../settings/notification-mute-repository.port';

import {
  NOTIFICATION_REPOSITORY,
  type NotificationRecord,
  type NotificationRepository,
} from './notification-repository.port';
import { NotificationsGateway } from './notifications.gateway';

/** What another module hands over when something happens. */
export interface NotifyInput {
  readonly userId: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly href?: string | undefined;
}

/**
 * Storing and delivering notifications.
 *
 * `notify` is called directly by the modules that raise events — rides,
 * drivers — rather than through an event bus. There are two publishers, not
 * twenty; a bus would decouple them on paper and make "why did this
 * notification appear" an untraceable question in practice.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  public constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepository,
    @Inject(NOTIFICATION_MUTE_REPOSITORY)
    private readonly mutes: NotificationMuteRepository,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Record something and push it.
   *
   * Stored first, then delivered. The row is the notification; the socket
   * push is an optimisation for someone who happens to be looking. Doing it
   * the other way round would mean a user connected at that instant sees a
   * message that a failed insert means nobody can ever see again.
   *
   * Never throws. A notification is a side effect of something that already
   * succeeded — a ride was accepted, an application was approved — and
   * failing that operation because its notification could not be written
   * would be the tail wagging the dog.
   */
  public async notify(input: NotifyInput): Promise<void> {
    try {
      /* Checked here rather than at each call site. A publisher that has to
         remember to ask is a publisher that will eventually forget, and the
         symptom — a rider still receiving something they switched off — is
         one nobody reports as a bug, they just stop trusting the setting.

         Nothing is stored for a muted kind. Writing the row and hiding it
         would leave a notification list that disagrees with the unread
         count, and "off" that still accumulates is not off. */
      if (await this.mutes.isMuted(input.userId, input.kind)) return;

      const record = await this.notifications.create(input);

      this.gateway.deliver(input.userId, toNotification(record));
    } catch (cause) {
      this.logger.warn(`Could not notify ${input.userId}: ${describe(cause)}`);
    }
  }

  public async list(
    userId: string,
    query: NotificationListQuery,
  ): Promise<NotificationPage> {
    const [page, unreadCount] = await Promise.all([
      this.notifications.listForUser(userId, {
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      }),
      this.notifications.countUnread(userId),
    ]);

    const data = page.notifications.map(toNotification);

    return {
      data,
      pageInfo: {
        nextCursor: page.hasNextPage ? (data.at(-1)?.id ?? null) : null,
        hasNextPage: page.hasNextPage,
      },
      unreadCount,
    };
  }

  /** Null when the notification is not this user's. */
  public async markRead(
    userId: string,
    notificationId: string,
  ): Promise<Notification | null> {
    const record = await this.notifications.markRead(userId, notificationId);

    return record === null ? null : toNotification(record);
  }

  public async markAllRead(userId: string): Promise<number> {
    return this.notifications.markAllRead(userId);
  }

  public async countUnread(userId: string): Promise<number> {
    return this.notifications.countUnread(userId);
  }
}

function toNotification(record: NotificationRecord): Notification {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    body: record.body,
    href: record.href,
    readAt: record.readAt === null ? null : record.readAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown error';
}
