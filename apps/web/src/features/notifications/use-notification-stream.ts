'use client';

import { NOTIFICATION_EVENTS, notificationSchema } from '@cholojai/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { appSocket } from '@/lib/socket';

/**
 * Keep the notification list fresh while the page is open.
 *
 * The pushed notification is parsed and then *discarded*, and the query is
 * invalidated instead of being patched with it. Splicing it into the cached
 * page by hand would mean maintaining the ordering, the cursor and the
 * unread count in two places — the server already computes all three
 * together, and one round trip is cheaper than a badge that drifts.
 *
 * Parsed even so: the payload decides whether a refetch happens, and
 * anything arriving over a socket is input rather than fact.
 */
export function useNotificationStream(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = appSocket('/notifications');

    function onCreated(payload: unknown): void {
      if (!notificationSchema.safeParse(payload).success) return;

      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }

    socket.on(NOTIFICATION_EVENTS.created, onCreated);
    socket.connect();

    return () => {
      /* The listener goes, the connection stays. Another screen may be
         using it, and reconnecting on every navigation would cost a
         handshake per route change. */
      socket.off(NOTIFICATION_EVENTS.created, onCreated);
    };
  }, [queryClient]);
}
