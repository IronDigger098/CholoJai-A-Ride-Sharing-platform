'use client';

import { type Notification } from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useId, useState } from 'react';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api';
import { useNotificationStream } from '../use-notification-stream';

import { Button } from '@/components/ui/button';

/** One screenful. The panel is a glance, not an archive. */
const PAGE_SIZE = 10;

/**
 * The notification bell and its panel.
 *
 * The count comes from the same response as the list, so the badge cannot
 * claim three while the panel shows two — they were computed together by the
 * server rather than by two requests that raced.
 */
export function NotificationBell(): ReactNode {
  const queryClient = useQueryClient();
  const router = useRouter();
  const id = useId();

  const [open, setOpen] = useState(false);

  useNotificationStream();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications({ limit: PAGE_SIZE }),
  });

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refresh,
  });

  const notifications = data?.data ?? [];
  const unread = data?.unreadCount ?? 0;

  function onOpen(notification: Notification): void {
    /* Marked read on the way out, not awaited. Navigation is what the
       person asked for; the read receipt is bookkeeping, and making them
       wait for a round trip to follow their own notification would be
       putting our records ahead of their intent. */
    if (notification.readAt === null) read.mutate(notification.id);

    setOpen(false);

    if (notification.href !== null) router.push(notification.href);
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-label={
          unread === 0
            ? 'Notifications'
            : `Notifications, ${String(unread)} unread`
        }
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="bg-action text-action-content rounded-full px-1.5 text-xs font-semibold tabular-nums"
          >
            {unread}
          </span>
        )}
      </Button>

      {open && (
        <div
          id={`${id}-panel`}
          className="border-border-strong bg-surface absolute right-0 z-20 mt-2 w-80 rounded-md border p-2 shadow-lg"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <h2 className="text-sm font-medium">Notifications</h2>

            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={readAll.isPending}
                onClick={() => {
                  readAll.mutate();
                }}
              >
                Mark all read
              </Button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-content-muted px-2 py-4 text-sm">Nothing yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(notification);
                    }}
                    className="hover:bg-surface-raised w-full rounded-sm px-2 py-2 text-left"
                  >
                    <span className="flex items-baseline gap-2">
                      {/* The unread mark is a dot beside the title, not a
                          different background. A whole row tinted for
                          "unread" is a colour-only signal, invisible to
                          anyone who cannot see the difference. */}
                      <span
                        aria-hidden="true"
                        className={
                          notification.readAt === null
                            ? 'bg-action mt-1.5 h-2 w-2 shrink-0 rounded-full'
                            : 'mt-1.5 h-2 w-2 shrink-0'
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {notification.title}
                          {notification.readAt === null && (
                            <span className="sr-only"> (unread)</span>
                          )}
                        </span>
                        <span className="text-content-muted block text-xs">
                          {notification.body}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
