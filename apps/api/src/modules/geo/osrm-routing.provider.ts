import { type Coordinates, type RouteResponse } from '@cholojai/shared';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { AppConfigService } from '../../config/app-config.service';

import { RouteNotFoundError, RoutingUnavailableError } from './geo.errors';
import { type RoutingProvider } from './routing.port';

/**
 * OSRM, behind the routing port.
 *
 * The only file in the application that knows OSRM exists. Its URL shape,
 * its coordinate ordering, and its response envelope stop here.
 */

/**
 * OSRM's answer, as much of it as we rely on.
 *
 * Parsed rather than cast. This is a network boundary, and a cast would mean
 * a provider outage that returns an HTML error page becomes `undefined.distance`
 * several layers away — the failure would surface as a fare of NaN rather
 * than as "routing is down". `passthrough` is not used: extra fields are
 * ignored, so OSRM adding one cannot break us.
 */
const osrmRouteSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
      }),
    )
    .optional(),
});

/**
 * OSRM's own vocabulary for "those points are not connected by road".
 *
 * Anything else with a non-Ok code is a fault on our side of the
 * conversation — a malformed query, an unknown profile — and is reported as
 * unavailable rather than as a user-facing routing failure, because the user
 * cannot fix it and we need to see it in the logs.
 */
const NO_ROUTE_CODES = new Set(['NoRoute', 'NoSegment']);

@Injectable()
export class OsrmRoutingProvider implements RoutingProvider {
  private readonly logger = new Logger(OsrmRoutingProvider.name);

  public constructor(private readonly config: AppConfigService) {}

  public async route(
    pickup: Coordinates,
    dropoff: Coordinates,
  ): Promise<RouteResponse> {
    const { osrmBaseUrl, timeoutMs } = this.config.routing;

    /* OSRM takes lng,lat — the opposite order to almost every other API,
       and to how every human writes a coordinate. Getting it backwards
       does not error; it silently routes somewhere else entirely. This is
       the one place in the codebase that has to know. */
    const path =
      `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}` +
      '?overview=false&alternatives=false&steps=false';
    const url = `${osrmBaseUrl}/route/v1/driving/${path}`;

    let response: Response;
    try {
      /* A timeout is not optional. Without one, a hanging provider holds
         this request open until the client gives up, and every quote in
         flight holds a connection while it waits. */
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' },
      });
    } catch (cause) {
      this.logger.warn(
        `OSRM request failed: ${cause instanceof Error ? cause.message : 'unknown error'}`,
      );
      throw new RoutingUnavailableError(cause);
    }

    if (!response.ok) {
      this.logger.warn(`OSRM returned HTTP ${response.status}`);
      throw new RoutingUnavailableError(
        new Error(`OSRM responded ${response.status}`),
      );
    }

    const parsed = osrmRouteSchema.safeParse(await response.json());

    if (!parsed.success) {
      this.logger.warn('OSRM returned a body this service does not recognise');
      throw new RoutingUnavailableError(parsed.error);
    }

    if (NO_ROUTE_CODES.has(parsed.data.code)) {
      throw new RouteNotFoundError();
    }

    const route = parsed.data.routes?.[0];

    if (parsed.data.code !== 'Ok' || route === undefined) {
      this.logger.warn(`OSRM returned code ${parsed.data.code}`);
      throw new RoutingUnavailableError(
        new Error(`OSRM code ${parsed.data.code}`),
      );
    }

    /* OSRM reports metres and seconds as floats. Rounding here rather than
       at the fare boundary keeps the cached value and the priced value the
       same number — a quote re-priced from cache must not differ from the
       one that was quoted first. */
    return {
      distanceMetres: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
    };
  }
}
