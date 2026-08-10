import {
  type DriverLocation,
  driverLocationSchema,
  TRACKING_EVENTS,
} from '@cholojai/shared';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { type Server, type Socket } from 'socket.io';
import { z } from 'zod';

import { AccessTokenService } from '../../common/security/access-token.service';
import { AppConfigService } from '../../config/app-config.service';
import { RidesService } from '../rides/rides.service';

import { TrackingService } from './tracking.service';

/**
 * Live driver positions over Socket.IO.
 *
 * One room per ride. A driver publishes; the rider watching that ride
 * receives. Nothing is broadcast globally — a position tells you where a
 * specific person is right now, and the set of people entitled to know is
 * exactly two.
 */

const subscribeSchema = z.object({ rideId: z.string().min(1).max(64) });

/** The user id attached to an authenticated socket. */
interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  namespace: '/tracking',
  /* Same allow-list as the HTTP API. A socket bypasses CORS preflight but
     not the origin check, and leaving it open would let any page on the
     internet open a connection with the user's token. */
  cors: { credentials: true },
})
export class TrackingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  public constructor(
    private readonly tokens: AccessTokenService,
    private readonly rides: RidesService,
    private readonly tracking: TrackingService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Authenticate on connect, not per message.
   *
   * A socket is a long-lived connection, so the alternative is verifying the
   * same token on every position — dozens of times a minute per driver, to
   * reach the same answer. The token is read from the handshake rather than
   * a header because browsers cannot set headers on a WebSocket upgrade.
   *
   * The consequence is real and worth stating: a socket outlives the access
   * token that opened it. That is acceptable here because the only thing it
   * can do is publish or read one ride's position, and both are re-checked
   * against ride membership on every message.
   */
  public handleConnection(client: AuthenticatedSocket): void {
    /* Typed `unknown`, not inferred: socket.io types the handshake auth bag
       as `any`, and this value is attacker-supplied. */
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

    client.userId = verification.claims.sub;

    if (!this.config.isProduction) {
      this.logger.debug(`Socket connected for ${verification.claims.sub}`);
    }
  }

  /**
   * Join a ride's room, if the caller is on that ride.
   *
   * Membership is checked here rather than trusted from the client, because
   * a room name is a guessable string and the whole point of the room is
   * that only two people are in it.
   */
  @SubscribeMessage(TRACKING_EVENTS.subscribe)
  public async onSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success || client.userId === undefined) return;

    const active = await this.rides.findActive(client.userId);
    if (active?.id !== parsed.data.rideId) return;

    await client.join(room(parsed.data.rideId));

    /* Send the last-known position immediately. Without it a rider who
       opens the screen between pings sees nothing at all. */
    const last = await this.tracking.lastKnown(parsed.data.rideId);
    if (last !== null) client.emit(TRACKING_EVENTS.location, last);
  }

  /**
   * A driver publishes their position.
   *
   * Re-checked against the ride on every message rather than trusted from
   * the connection: a driver whose ride ended a minute ago must stop being
   * able to publish to it, and the socket does not know that happened.
   */
  @SubscribeMessage(TRACKING_EVENTS.publish)
  public async onPublish(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const parsed = driverLocationSchema.safeParse(body);
    if (!parsed.success || client.userId === undefined) return;

    const active = await this.rides.findActive(client.userId);
    if (active?.id !== parsed.data.rideId) return;

    const location: DriverLocation = parsed.data;

    await this.tracking.remember(location);

    /* To the room, not back to the sender: the driver already knows where
       they are, and echoing costs a message per ping for nothing. */
    client.to(room(location.rideId)).emit(TRACKING_EVENTS.location, location);
  }
}

function room(rideId: string): string {
  return `ride:${rideId}`;
}
