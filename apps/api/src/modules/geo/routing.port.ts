import { type Coordinates, type RouteResponse } from '@cholojai/shared';

/**
 * What the application needs from a routing engine.
 *
 * A port, for the same reasons as `Mailer` and `UserRepository`: the fares
 * module depends on "something that can measure a journey", not on OSRM, its
 * URL scheme, or its JSON. Self-hosting OSRM instead of using the public
 * demo server, or moving to Mapbox because it models traffic, is then a
 * binding change in one module rather than an edit to every caller.
 *
 * The testing consequence is the one that matters day to day. Pricing a ride
 * in a unit test needs a known distance, not a network call — and a suite
 * that reaches the internet is a suite that fails when someone else's server
 * is slow.
 */
export interface RoutingProvider {
  /**
   * Measure the driving route between two points.
   *
   * Throws `RouteNotFoundError` when no road connects them and
   * `RoutingUnavailableError` when the provider cannot be reached. Those are
   * genuinely different: the first will never succeed, the second is worth
   * retrying, and a caller that cannot tell them apart will either retry
   * forever or give up too early.
   */
  route(pickup: Coordinates, dropoff: Coordinates): Promise<RouteResponse>;
}

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');
