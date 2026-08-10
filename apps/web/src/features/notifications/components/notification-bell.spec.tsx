import {
  type Notification,
  NotificationKind,
  type NotificationPage,
} from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NotificationBell } from './notification-bell';

import { renderWithProviders } from '@/testing/render-with-providers';

const UNREAD: Notification = {
  id: 'notification_1',
  kind: NotificationKind.RIDE_ACCEPTED,
  title: 'Your driver is on the way',
  body: 'A driver accepted your ride.',
  href: '/rides/ride_1',
  readAt: null,
  createdAt: '2026-08-10T09:00:00.000Z',
};

function page(data: Notification[], unreadCount: number): NotificationPage {
  return {
    data,
    pageInfo: { nextCursor: null, hasNextPage: false },
    unreadCount,
  };
}

const mockList = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();
const mockPush = jest.fn();

jest.mock('../api', () => ({
  listNotifications: (query: unknown) => mockList(query),
  markNotificationRead: (id: string) => mockMarkRead(id),
  markAllNotificationsRead: () => mockMarkAllRead(),
}));

/* The socket is a transport, not behaviour worth reproducing here. Its own
   job — invalidating the query on a push — is one line in the hook. */
jest.mock('../use-notification-stream', () => ({
  useNotificationStream: () => undefined,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockMarkRead.mockReset();
    mockMarkAllRead.mockReset();
    mockPush.mockReset();
    mockList.mockResolvedValue(page([UNREAD], 1));
    mockMarkRead.mockResolvedValue({
      ...UNREAD,
      readAt: '2026-08-10T10:00:00.000Z',
    });
    mockMarkAllRead.mockResolvedValue(undefined);
  });

  it('announces the unread count in the button name', async () => {
    /* The badge is a number in a coloured circle — invisible to a screen
       reader unless the count is in the accessible name. */
    renderWithProviders(<NotificationBell />);

    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeVisible();
  });

  it('says only "Notifications" when nothing is waiting', async () => {
    mockList.mockResolvedValue(page([], 0));
    renderWithProviders(<NotificationBell />);

    expect(
      await screen.findByRole('button', { name: 'Notifications' }),
    ).toBeVisible();
  });

  it('keeps the panel closed until asked', async () => {
    renderWithProviders(<NotificationBell />);

    await screen.findByRole('button', { name: /Notifications/u });

    expect(screen.queryByText('Your driver is on the way')).toBeNull();
  });

  it('lists notifications when opened', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationBell />);

    await user.click(
      await screen.findByRole('button', { name: /Notifications/u }),
    );

    expect(screen.getByText('Your driver is on the way')).toBeVisible();
  });

  it('marks one read and follows it', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationBell />);

    await user.click(
      await screen.findByRole('button', { name: /Notifications/u }),
    );
    await user.click(
      screen.getByRole('button', { name: /Your driver is on the way/u }),
    );

    expect(mockMarkRead).toHaveBeenCalledWith('notification_1');
    expect(mockPush).toHaveBeenCalledWith('/rides/ride_1');
  });

  it('does not re-mark one that was already read', async () => {
    mockList.mockResolvedValue(
      page([{ ...UNREAD, readAt: '2026-08-10T09:30:00.000Z' }], 0),
    );
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationBell />);

    await user.click(
      await screen.findByRole('button', { name: /Notifications/u }),
    );
    await user.click(
      screen.getByRole('button', { name: /Your driver is on the way/u }),
    );

    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/rides/ride_1');
  });

  it('offers "mark all read" only when something is unread', async () => {
    mockList.mockResolvedValue(page([], 0));
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationBell />);

    await user.click(
      await screen.findByRole('button', { name: /Notifications/u }),
    );

    expect(
      screen.queryByRole('button', { name: 'Mark all read' }),
    ).not.toBeInTheDocument();
  });

  it('marks everything read', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationBell />);

    await user.click(
      await screen.findByRole('button', { name: /Notifications/u }),
    );
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() => {
      expect(mockMarkAllRead).toHaveBeenCalled();
    });
  });

  it('says so when there is nothing', async () => {
    mockList.mockResolvedValue(page([], 0));
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<NotificationBell />);

    await user.click(
      await screen.findByRole('button', { name: /Notifications/u }),
    );

    expect(screen.getByText('Nothing yet.')).toBeVisible();
  });
});
