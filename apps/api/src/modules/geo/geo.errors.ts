import {
  ServiceUnavailableError,
  UnprocessableError,
} from '../../common/errors/domain-error';

/**
 * The two points are valid, and no driving route connects them.
 *
 * 422 rather than 400: nothing about the request is malformed. Both
 * coordinates are real places, they are simply not reachable from one
 * another by road — an island, a spot in the Bay of Bengal, a pin dropped
 * across a river with no bridge. Retrying the identical request will never
 * change the answer, which is what separates this from a 503.
 */
export class RouteNotFoundError extends UnprocessableError {
  public readonly code = 'ROUTE_NOT_FOUND';
  public readonly title = 'No route between those points';

  public constructor() {
    super(
      'We could not find a driving route between those two places. ' +
        'Check the pickup and destination and try again.',
    );
  }
}

/**
 * The routing provider did not answer.
 *
 * 503, and deliberately not dressed up as anything else. The request was
 * fine and the same request will probably succeed shortly, so the client
 * should be told to retry rather than shown a validation message about
 * coordinates that were never the problem.
 *
 * The provider's own error is attached as `cause` for the logs and never
 * reaches the response body — an upstream message can carry a URL, an API
 * key, or an internal hostname.
 */
/**
 * The geocoder did not answer.
 *
 * Its own error rather than reusing `RoutingUnavailableError`. They are
 * different upstreams that fail independently — Nominatim can be down while
 * OSRM is fine — and a log line saying "routing unavailable" during a
 * geocoding outage sends whoever is on call to the wrong service.
 */
export class GeocodingUnavailableError extends ServiceUnavailableError {
  public readonly code = 'GEOCODING_UNAVAILABLE';
  public readonly title = 'Place search is temporarily unavailable';

  public constructor(cause?: unknown) {
    super(
      'We could not search for places just now. Please try again in a moment.',
      cause === undefined ? undefined : { cause },
    );
  }
}

export class RoutingUnavailableError extends ServiceUnavailableError {
  public readonly code = 'ROUTING_UNAVAILABLE';
  public readonly title = 'Routing is temporarily unavailable';

  public constructor(cause?: unknown) {
    super(
      'We could not work out the route just now. Please try again in a moment.',
      cause === undefined ? undefined : { cause },
    );
  }
}
