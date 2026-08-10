import { type Notification, NotificationKind } from '@cholojai/shared';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { InMemoryNotificationRepository } from '../../testing/in-memory-notification.repository';

import { type NotificationRepository } from './notification-repository.port';
import { type NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

const RIDER = 'user_rider_1';
const OTHER = 'user_other_1';

const RIDE_ACCEPTED = {
  kind: NotificationKind.RIDE_ACCEPTED,
  title: 'Your driver is on the way',
  body: 'Imran accepted your ride.',
};

/** Records what was pushed, so delivery can be asserted without a socket. */
function makeGateway(): {
  gateway: NotificationsGateway;
  delivered: { userId: string; notification: Notification }[];
} {
  const delivered: { userId: string; notification: Notification }[] = [];

  const gateway = {
    deliver: (userId: string, notification: Notification) => {
      delivered.push({ userId, notification });
    },
  } as unknown as NotificationsGateway;

  return { gateway, delivered };
}

describe('NotificationsService', () => {
  let notifications: InMemoryNotificationRepository;
  let gateway: ReturnType<typeof makeGateway>;
  let service: NotificationsService;

  beforeEach(() => {
    notifications = new InMemoryNotificationRepository();
    gateway = makeGateway();
    service = new NotificationsService(notifications, gateway.gateway);
  });

  describe('notify', () => {
    it('stores the notification and pushes it', async () => {
      await service.notify({ userId: RIDER, ...RIDE_ACCEPTED });

      expect(notifications.rows).toHaveLength(1);
      expect(gateway.delivered[0]?.userId).toBe(RIDER);
      expect(gateway.delivered[0]?.notification.title).toBe(
        RIDE_ACCEPTED.title,
      );
    });

    it('stores before it pushes', async () => {
      /* The row is the notification; the push is an optimisation for
         someone who happens to be looking. Pushing first would show a
         message that a failed insert means nobody can see again. */
      await service.notify({ userId: RIDER, ...RIDE_ACCEPTED });

      expect(gateway.delivered[0]?.notification.id).toBe(
        notifications.rows[0]?.id,
      );
    });

    it('does not throw when storing fails', async () => {
      /* A notification is a side effect of something that already
         succeeded. Failing the ride because its notification could not be
         written would be the tail wagging the dog. */
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      const broken = {
        create: () => Promise.reject(new Error('database is on fire')),
      } as unknown as NotificationRepository;

      await expect(
        new NotificationsService(broken, gateway.gateway).notify({
          userId: RIDER,
          ...RIDE_ACCEPTED,
        }),
      ).resolves.toBeUndefined();

      expect(gateway.delivered).toEqual([]);
      jest.restoreAllMocks();
    });
  });

  describe('list', () => {
    it('returns newest first with the unread count', async () => {
      await service.notify({ userId: RIDER, ...RIDE_ACCEPTED });
      await service.notify({
        userId: RIDER,
        ...RIDE_ACCEPTED,
        kind: NotificationKind.RIDE_COMPLETED,
        title: 'Ride finished',
      });

      const page = await service.list(RIDER, { limit: 20 });

      expect(page.data[0]?.title).toBe('Ride finished');
      expect(page.unreadCount).toBe(2);
    });

    it('counts unread beyond the page it returns', async () => {
      /* The badge has to mean "unread notifications", not "unread
         notifications on the page you are looking at". */
      for (let index = 0; index < 3; index += 1) {
        await service.notify({ userId: RIDER, ...RIDE_ACCEPTED });
      }

      const page = await service.list(RIDER, { limit: 1 });

      expect(page.data).toHaveLength(1);
      expect(page.unreadCount).toBe(3);
      expect(page.pageInfo.hasNextPage).toBe(true);
    });

    it('shows nobody else’s notifications', async () => {
      await service.notify({ userId: OTHER, ...RIDE_ACCEPTED });

      const page = await service.list(RIDER, { limit: 20 });

      expect(page.data).toEqual([]);
      expect(page.unreadCount).toBe(0);
    });
  });

  describe('markRead', () => {
    it('marks one read and drops the unread count', async () => {
      await service.notify({ userId: RIDER, ...RIDE_ACCEPTED });
      const id = notifications.rows[0]?.id ?? '';

      const marked = await service.markRead(RIDER, id);

      expect(marked?.readAt).not.toBeNull();
      expect(await service.countUnread(RIDER)).toBe(0);
    });

    it('is idempotent', async () => {
      /* A double tap should not produce an error — the caller's intent is
         satisfied either way. */
      await service.notify({ userId: RIDER, ...RIDE_ACCEPTED });
      const id = notifications.rows[0]?.id ?? '';

      await service.markRead(RIDER, id);

      expect(await service.markRead(RIDER, id)).not.toBeNull();
    });

    it('will not mark somebody else’s notification read', async () => {
      await service.notify({ userId: OTHER, ...RIDE_ACCEPTED });
      const id = notifications.rows[0]?.id ?? '';

      expect(await service.markRead(RIDER, id)).toBeNull();
      expect(await service.countUnread(OTHER)).toBe(1);
    });
  });

  describe('markAllRead', () => {
    it('clears only the caller’s unread notifications', async () => {
      await service.notify({ userId: RIDER, ...RIDE_ACCEPTED });
      await service.notify({ userId: RIDER, ...RIDE_ACCEPTED });
      await service.notify({ userId: OTHER, ...RIDE_ACCEPTED });

      expect(await service.markAllRead(RIDER)).toBe(2);
      expect(await service.countUnread(RIDER)).toBe(0);
      expect(await service.countUnread(OTHER)).toBe(1);
    });
  });
});
