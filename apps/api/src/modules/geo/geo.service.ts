import {
  type Coordinates,
  type Place,
  placeSchema,
  type RouteResponse,
  routeResponseSchema,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';
import { type ZodType } from 'zod';

import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { AppConfigService } from '../../config/app-config.service';

import { GEOCODING_PROVIDER, type GeocodingProvider } from './geocoding.port';
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
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Search for a place by name.
   *
   * Cached on the normalised query. A picker fires a request per keystroke
   * once debounced, and "banani" typed by a hundred riders is one upstream
   * call — which matters more here than for routes, because Nominatim's
   * usage policy caps absolute volume rather than rate.
   */
  public async searchPlaces(query: string): Promise<readonly Place[]> {
    const key = `geo:search:${query.trim().toLowerCase()}`;

    const cached = await this.readCache(key, placeSchema.array());
    if (cached !== null) return cached;

    const places = await this.geocoding.search(query);
    await this.writeCache(key, places, this.config.geocoding.cacheTtlSeconds);

    return places;
  }

  /**
   * The place at a point.
   *
   * Cached on the same ~11 metre grid as routes: two pins that close are the
   * same doorway as far as any address is concerned.
   */
  public async reverseGeocode(point: Coordinates): Promise<Place | null> {
    const key = `geo:reverse:${point.lat.toFixed(KEY_PRECISION)},${point.lng.toFixed(KEY_PRECISION)}`;

    const cached = await this.readCache(key, placeSchema.nullable());
    if (cached !== null) return cached;

    const place = await this.geocoding.reverse(point);
    await this.writeCache(key, place, this.config.geocoding.cacheTtlSeconds);

    return place;
  }

  public async route(
    pickup: Coordinates,
    dropoff: Coordinates,
  ): Promise<RouteResponse> {
    const key = cacheKey(pickup, dropoff);

    const cached = await this.readCache(key, routeResponseSchema);
    if (cached !== null) return cached;

    const route = await this.routing.route(pickup, dropoff);

    await this.writeCache(key, route, this.config.routing.cacheTtlSeconds);

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
  /**
   * Read a cached value, treating every failure as a miss.
   *
   * Redis being down, a value written by an older version of this code, or
   * anything unparseable all land here and all mean the same thing: go and
   * ask the provider.
   *
   * A cached `null` is indistinguishable from a miss, which is why an empty
   * reverse lookup is effectively uncached. That is the honest trade for one
   * generic reader, and the case it costs — a pin in open water — is rare
   * enough not to buy a sentinel value for.
   */
  private async readCache<T>(
    key: string,
    schema: ZodType<T>,
  ): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;

      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch (cause) {
      this.logger.warn(`Cache read failed for ${key}: ${describe(cause)}`);
      return null;
    }
  }

  private async writeCache(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (cause) {
      this.logger.warn(`Cache write failed for ${key}: ${describe(cause)}`);
    }
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown error';
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
