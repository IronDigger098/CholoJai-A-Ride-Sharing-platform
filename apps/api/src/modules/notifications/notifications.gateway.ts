import { type Notification, NOTIFICATION_EVENTS } from '@cholojai/shared';
import {
  type OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { type Server, type Socket } from 'socket.io';

import { AccessTokenService } from '../../common/security/access-token.service';

/**
 * Notifications, pushed to whoever they are for.
 *
 * A second namespace rather than a second connection. Socket.IO multiplexes
 * namespaces over one transport, so a client already connected to
 * `/tracking` pays nothing for this beyond a handshake — while the two stay
 * independent modules, which sharing a gateway class would not allow: the
 * tracking gateway needs the rides module, and notifications are raised
 * *by* rides. Sharing one class would close that loop.
 *
 * One room per user, not per socket. Someone signed in on a phone and a
 * laptop is one person, and a notification belongs to the person.
 */
@WebSocketGateway({ namespace: '/notifications', cors: { credentials: true } })
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server;

  public constructor(private readonly tokens: AccessTokenService) {}

  public async handleConnection(client: Socket): Promise<void> {
    /* Typed `unknown`: socket.io types the handshake bag as `any`, and this
       value is attacker-supplied. */
    const token: unknown = client.handshake.auth['token'];

    if (typeof token !== 'string') {
      client.disconnect(true);
      return;
    }

    const verification = this.tokens.verify(token);

    if (verification.status !== 'valid') {
      client.disconnect(true);
      return;
    }

    await client.join(room(verification.claims.sub));
  }

  /**
   * Deliver to every socket that user has open.
   *
   * Best-effort by design. A notification is stored before this is called,
   * so a user with nothing connected loses nothing — they see it on their
   * next page load. That is the whole reason the row exists.
   */
  public deliver(userId: string, notification: Notification): void {
    this.server
      .to(room(userId))
      .emit(NOTIFICATION_EVENTS.created, notification);
  }
}

function room(userId: string): string {
  return `user:${userId}`;
}
