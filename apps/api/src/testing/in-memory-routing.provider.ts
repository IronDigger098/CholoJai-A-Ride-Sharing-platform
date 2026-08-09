import { type Coordinates, type RouteResponse } from '@cholojai/shared';

import { RouteNotFoundError } from '../modules/geo/geo.errors';
import { type RoutingProvider } from '../modules/geo/routing.port';

/**
 * A routing provider that measures straight lines.
 *
 * Shared by every suite that needs a distance without a network. It lives
 * here rather than inside one spec file because several modules price rides
 * — geo, fares, and rides — and a per-suite copy would drift from the port
 * it implements the first time that port changes.
 *
 * Deliberately *not* a production fallback. Haversine distance is 20-40%
 * short of a real Dhaka road route, and a fare built on it would undercharge
 * every ride while looking entirely plausible. A fake that is good enough to
 * ship by accident is the dangerous kind.
 */

const EARTH_RADIUS_METRES = 6_371_000;

/** Roughly urban driving speed, and the reason this is a test double only. */
const ASSUMED_SPEED_METRES_PER_SECOND = 8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function haversineMetres(from: Coordinates, to: Coordinates): number {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(deltaLng / 2) ** 2;

  return Math.round(
    EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

export class InMemoryRoutingProvider implements RoutingProvider {
  /** Points a test wants to be unreachable, keyed `lat,lng`. */
  private readonly unreachable = new Set<string>();

  public calls = 0;

  public markUnreachable(point: Coordinates): void {
    this.unreachable.add(`${point.lat},${point.lng}`);
  }

  public async route(
    pickup: Coordinates,
    dropoff: Coordinates,
  ): Promise<RouteResponse> {
    this.calls += 1;

    if (this.unreachable.has(`${dropoff.lat},${dropoff.lng}`)) {
      throw new RouteNotFoundError();
    }

    const distanceMetres = haversineMetres(pickup, dropoff);

    return {
      distanceMetres,
      durationSeconds: Math.round(
        distanceMetres / ASSUMED_SPEED_METRES_PER_SECOND,
      ),
    };
  }
}
