import {
  type Coordinates,
  type RouteResponse,
  routeResponseSchema,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { AppConfigService } from '../../config/app-config.service';

import { ROUTING_PROVIDER, type RoutingProvider } from './routing.port';

/**
 * Routing, with a cache in front of it.
 *
 * The cache is the reason this service exists at all — without it the
 * controller could call the provider directly. Two riders comparing the same
 * journey, or one rider changing their mind about the vehicle type and
 * re-quoting, should not each cost an upstream request: routing is the
 * slowest thing in the quote path and the only part that leaves the network.
 */

/**
 * Coordinate precision used to build the cache key.
 *
 * Four decimal places is about 11 metres at this latitude. Caching on exact
 * coordinates would be nearly useless — a map pin moved one pixel is a
 * different key — while a coarser grid would quietly quote one street corner's
 * fare for another. Eleven metres is inside the error of a phone's GPS fix,
 * so two requests that collide here were, as far as anything can tell,
 * the same journey.
 */
const KEY_PRECISION = 4;

const CACHE_PREFIX = 'geo:route';

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  public constructor(
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
  ) {}

  public async route(
    pickup: Coordinates,
    dropoff: Coordinates,
  ): Promise<RouteResponse> {
    const key = cacheKey(pickup, dropoff);

    const cached = await this.readCache(key);
    if (cached !== null) return cached;

    const route = await this.routing.route(pickup, dropoff);

    await this.writeCache(key, route);

    return route;
  }

  /**
   * Read a cached route, treating every failure as a miss.
   *
   * A cache that can fail the request it was added to speed up is not a
   * cache. Redis being down, returning something unparseable, or holding a
   * value written by an older version of this code all land here, and all
   * mean the same thing: go and ask the provider.
   */
  private async readCache(key: string): Promise<RouteResponse | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;

      const parsed = routeResponseSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch (cause) {
      this.logger.warn(
        `Route cache read failed: ${cause instanceof Error ? cause.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private async writeCache(key: string, route: RouteResponse): Promise<void> {
    try {
      await this.redis.set(
        key,
        JSON.stringify(route),
        'EX',
        this.config.routing.cacheTtlSeconds,
      );
    } catch (cause) {
      this.logger.warn(
        `Route cache write failed: ${cause instanceof Error ? cause.message : 'unknown error'}`,
      );
    }
  }
}

/**
 * Build the cache key.
 *
 * Not symmetric, deliberately: A→B and B→A are different keys because they
 * are different drives. One-way streets, divided carriageways and turn
 * restrictions all mean the return leg can be a different distance, and
 * collapsing the pair would quote one of them at the other's price.
 */
function cacheKey(pickup: Coordinates, dropoff: Coordinates): string {
  const round = (value: number): string => value.toFixed(KEY_PRECISION);
  return [
    CACHE_PREFIX,
    `${round(pickup.lat)},${round(pickup.lng)}`,
    `${round(dropoff.lat)},${round(dropoff.lng)}`,
  ].join(':');
}
