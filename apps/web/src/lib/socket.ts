import { io, type Socket } from 'socket.io-client';

import { accessToken } from '@/lib/access-token';

/**
 * One socket per namespace, for the whole app.
 *
 * Namespaces are multiplexed by Socket.IO over a single transport, so a page
 * connected to both `/tracking` and `/notifications` holds one connection and
 * two logical channels. Creating them through here rather than per feature is
 * what makes that true — two independent `io()` calls to the same origin can
 * end up with two managers.
 *
 * The token travels in the handshake because a browser cannot set headers on
 * a WebSocket upgrade. It is read at connect time rather than captured, so a
 * reconnection after a refresh carries the new token rather than the dead one.
 */

const BASE_URL = (
  process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:4000/api/v1'
).replace(/\/api\/v1$/u, '');

const sockets = new Map<string, Socket>();

export function appSocket(namespace: string): Socket {
  const existing = sockets.get(namespace);
  if (existing !== undefined) return existing;

  const socket = io(`${BASE_URL}${namespace}`, {
    withCredentials: true,
    /* Not until someone asks. A page that never subscribes to anything
       should not hold a connection open. */
    autoConnect: false,
    auth: (cb: (data: Record<string, unknown>) => void) => {
      cb({ token: accessToken.get() ?? '' });
    },
  });

  sockets.set(namespace, socket);
  return socket;
}
