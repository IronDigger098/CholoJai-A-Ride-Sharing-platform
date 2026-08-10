import { io, type Socket } from 'socket.io-client';

import { accessToken } from '@/lib/access-token';

/**
 * The tracking socket.
 *
 * One connection for the whole app, created lazily. Sockets are expensive to
 * open and a screen that mounts two of them sends every position twice.
 *
 * The token travels in the handshake because a browser cannot set headers on
 * a WebSocket upgrade. It is read at connect time rather than captured, so a
 * reconnection after a refresh carries the new token rather than the dead
 * one.
 */

const BASE_URL = (
  process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:4000/api/v1'
).replace(/\/api\/v1$/u, '');

let socket: Socket | null = null;

export function trackingSocket(): Socket {
  socket ??= io(`${BASE_URL}/tracking`, {
    withCredentials: true,
    /* Not until someone asks. A page that never tracks anything should not
       hold a connection open. */
    autoConnect: false,
    auth: (cb: (data: Record<string, unknown>) => void) => {
      cb({ token: accessToken.get() ?? '' });
    },
  });

  return socket;
}
