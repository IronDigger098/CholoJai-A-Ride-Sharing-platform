import {
  type DriverLocation,
  type Ride,
  TRACKING_EVENTS,
  UserRole,
} from '@cholojai/shared';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';

import {
  AccessTokenService,
  accessTokenJwtOptions,
} from '../../common/security/access-token.service';
import { makeTestConfig } from '../../testing/env.fixture';
import { type RidesService } from '../rides/rides.service';

import { type AuthenticatedSocket, TrackingGateway } from './tracking.gateway';
import { type TrackingService } from './tracking.service';

/**
 * The gateway's job is authorisation, not transport.
 *
 * Both handlers reduce to one question — is this person on this ride — and
 * everything else is Socket.IO doing what Socket.IO does. So the socket here
 * is a fake rather than a real connection: a live server would test the
 * library and add seconds to every run, while the branch that matters (a
 * position going to a room the caller is not in) is decided before any byte
 * reaches the wire.
 *
 * What this deliberately does not prove is that `to(room).emit(...)` excludes
 * the sender and reaches the other member. That is Socket.IO's contract, and
 * asserting it against a fake would only prove the fake agrees with itself.
 */

const RIDER = 'user_rider_1';
const DRIVER = 'user_driver_1';
const RIDE = 'ride_1';

const config = makeTestConfig();
const tokens = new AccessTokenService(
  new JwtService(accessTokenJwtOptions(config)),
  config,
);

function tokenFor(userId: string): string {
  return tokens.sign({ sub: userId, roles: [UserRole.RIDER] });
}

function locationOn(rideId: string): DriverLocation {
  return {
    rideId,
    coordinates: { lat: 23.7806, lng: 90.4074 },
    at: '2026-08-10T09:00:00.000Z',
  };
}

/** A message the socket was asked to send. `room` is null when direct. */
interface Emission {
  readonly room: string | null;
  readonly event: string;
  readonly payload: unknown;
}

/** The smallest thing that behaves like the socket these handlers touch. */
class FakeSocket {
  public userId?: string;
  public disconnected = false;
  public readonly handshake: { auth: Record<string, unknown> };
  public readonly joined: string[] = [];
  public readonly emissions: Emission[] = [];

  public constructor(auth: Record<string, unknown> = {}) {
    this.handshake = { auth };
  }

  public disconnect(): void {
    this.disconnected = true;
  }

  public join(room: string): Promise<void> {
    this.joined.push(room);
    return Promise.resolve();
  }

  public emit(event: string, payload: unknown): void {
    this.emissions.push({ room: null, event, payload });
  }

  public to(room: string): { emit: (event: string, payload: unknown) => void } {
    return {
      emit: (event, payload) => {
        this.emissions.push({ room, event, payload });
      },
    };
  }

  public asSocket(): AuthenticatedSocket {
    return this as unknown as AuthenticatedSocket;
  }
}

/**
 * A stand-in for `RidesService` that knows who is on which ride.
 *
 * Only `findActive` is reachable from the gateway, and only the ride's `id`
 * is read — the gateway compares it and does nothing else with the ride.
 */
function makeRides(activeByUser: Record<string, string>): RidesService {
  return {
    findActive: (userId: string) => {
      const id = activeByUser[userId];
      return Promise.resolve(id === undefined ? null : ({ id } as Ride));
    },
  } as unknown as RidesService;
}

function makeTracking(last: DriverLocation | null = null): {
  service: TrackingService;
  remembered: DriverLocation[];
} {
  const remembered: DriverLocation[] = [];

  const service = {
    remember: (location: DriverLocation) => {
      remembered.push(location);
      return Promise.resolve();
    },
    lastKnown: () => Promise.resolve(last),
  } as unknown as TrackingService;

  return { service, remembered };
}

describe('TrackingGateway', () => {
  describe('handleConnection', () => {
    let gateway: TrackingGateway;

    beforeEach(() => {
      gateway = new TrackingGateway(
        tokens,
        makeRides({}),
        makeTracking().service,
        config,
      );
    });

    it('records the user behind a valid token', () => {
      const client = new FakeSocket({ token: tokenFor(RIDER) });

      gateway.handleConnection(client.asSocket());

      expect(client.userId).toBe(RIDER);
      expect(client.disconnected).toBe(false);
    });

    it('disconnects a socket that presents no token', () => {
      const client = new FakeSocket();

      gateway.handleConnection(client.asSocket());

      expect(client.disconnected).toBe(true);
      expect(client.userId).toBeUndefined();
    });

    it('disconnects a socket whose token is not a string', () => {
      /* The handshake bag is attacker-supplied and typed `any` by
         socket.io, so the shape is checked rather than assumed. */
      const client = new FakeSocket({ token: { sub: RIDER } });

      gateway.handleConnection(client.asSocket());

      expect(client.disconnected).toBe(true);
    });

    it('disconnects a socket whose token does not verify', () => {
      const client = new FakeSocket({ token: 'not.a.jwt' });

      gateway.handleConnection(client.asSocket());

      expect(client.disconnected).toBe(true);
      expect(client.userId).toBeUndefined();
    });
  });

  describe('onSubscribe', () => {
    it('joins the room and replays the last-known position', async () => {
      const last = locationOn(RIDE);
      const tracking = makeTracking(last);
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [RIDER]: RIDE }),
        tracking.service,
        config,
      );
      const client = new FakeSocket({ token: tokenFor(RIDER) });
      gateway.handleConnection(client.asSocket());

      await gateway.onSubscribe(client.asSocket(), { rideId: RIDE });

      expect(client.joined).toEqual([`ride:${RIDE}`]);
      expect(client.emissions).toEqual([
        { room: null, event: TRACKING_EVENTS.location, payload: last },
      ]);
    });

    it('joins silently when nothing has been cached yet', async () => {
      /* A rider who subscribes before the driver's first ping. Joining
         still has to happen, or they never receive the second one. */
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [RIDER]: RIDE }),
        makeTracking(null).service,
        config,
      );
      const client = new FakeSocket({ token: tokenFor(RIDER) });
      gateway.handleConnection(client.asSocket());

      await gateway.onSubscribe(client.asSocket(), { rideId: RIDE });

      expect(client.joined).toEqual([`ride:${RIDE}`]);
      expect(client.emissions).toEqual([]);
    });

    it('refuses a room the caller is not on', async () => {
      /* The test the whole gateway exists for. A room name is a guessable
         string, so membership is proven against the ride rather than
         trusted from whoever asked. */
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [RIDER]: RIDE }),
        makeTracking(locationOn('ride_2')).service,
        config,
      );
      const client = new FakeSocket({ token: tokenFor(RIDER) });
      gateway.handleConnection(client.asSocket());

      await gateway.onSubscribe(client.asSocket(), { rideId: 'ride_2' });

      expect(client.joined).toEqual([]);
      expect(client.emissions).toEqual([]);
    });

    it('ignores a socket that never authenticated', async () => {
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [RIDER]: RIDE }),
        makeTracking().service,
        config,
      );
      const client = new FakeSocket();

      await gateway.onSubscribe(client.asSocket(), { rideId: RIDE });

      expect(client.joined).toEqual([]);
    });

    it('ignores a malformed body', async () => {
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [RIDER]: RIDE }),
        makeTracking().service,
        config,
      );
      const client = new FakeSocket({ token: tokenFor(RIDER) });
      gateway.handleConnection(client.asSocket());

      await gateway.onSubscribe(client.asSocket(), { ride: RIDE });

      expect(client.joined).toEqual([]);
    });
  });

  describe('onPublish', () => {
    it('caches the position and broadcasts it to the ride', async () => {
      const tracking = makeTracking();
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [DRIVER]: RIDE }),
        tracking.service,
        config,
      );
      const client = new FakeSocket({ token: tokenFor(DRIVER) });
      gateway.handleConnection(client.asSocket());
      const location = locationOn(RIDE);

      await gateway.onPublish(client.asSocket(), location);

      expect(tracking.remembered).toEqual([location]);
      expect(client.emissions).toEqual([
        {
          room: `ride:${RIDE}`,
          event: TRACKING_EVENTS.location,
          payload: location,
        },
      ]);
    });

    it('does not echo the position back to the driver', async () => {
      /* Addressed to the room rather than the socket. The driver already
         knows where they are, and echoing costs a message per ping. */
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [DRIVER]: RIDE }),
        makeTracking().service,
        config,
      );
      const client = new FakeSocket({ token: tokenFor(DRIVER) });
      gateway.handleConnection(client.asSocket());

      await gateway.onPublish(client.asSocket(), locationOn(RIDE));

      expect(client.emissions.every((sent) => sent.room !== null)).toBe(true);
    });

    it('refuses a position for a ride the driver is not on', async () => {
      /* A driver whose ride ended a minute ago. The socket does not know
         that happened, which is why the ride is re-read per message. */
      const tracking = makeTracking();
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [DRIVER]: RIDE }),
        tracking.service,
        config,
      );
      const client = new FakeSocket({ token: tokenFor(DRIVER) });
      gateway.handleConnection(client.asSocket());

      await gateway.onPublish(client.asSocket(), locationOn('ride_2'));

      expect(tracking.remembered).toEqual([]);
      expect(client.emissions).toEqual([]);
    });

    it('ignores coordinates that are not on the globe', async () => {
      const tracking = makeTracking();
      const gateway = new TrackingGateway(
        tokens,
        makeRides({ [DRIVER]: RIDE }),
        tracking.service,
        config,
      );
      const client = new FakeSocket({ token: tokenFor(DRIVER) });
      gateway.handleConnection(client.asSocket());

      await gateway.onPublish(client.asSocket(), {
        ...locationOn(RIDE),
        coordinates: { lat: 91, lng: 0 },
      });

      expect(tracking.remembered).toEqual([]);
      expect(client.emissions).toEqual([]);
    });
  });
});
