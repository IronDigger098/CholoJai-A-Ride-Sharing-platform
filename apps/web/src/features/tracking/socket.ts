import { type Socket } from 'socket.io-client';

import { appSocket } from '@/lib/socket';

/**
 * The tracking socket.
 *
 * A named wrapper rather than a namespace string sprinkled through the
 * tracking hooks — `appSocket('/tracking')` in four places is four chances
 * to typo a namespace into a silent no-op.
 */
export function trackingSocket(): Socket {
  return appSocket('/tracking');
}
