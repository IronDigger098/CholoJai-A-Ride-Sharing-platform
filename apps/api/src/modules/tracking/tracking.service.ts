import { type DriverLocation, driverLocationSchema } from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.module';

/**
 * Last-known driver positions.
 *
 * Redis with a short TTL, never PostgreSQL (D4). A position is interesting
 * for as long as the ride is happening and worthless afterwards, and writing
 * one row per ping would trade a large, permanent table for a trail nobody
 * reads.
 *
 * The cache exists for one case: a rider opening the tracking screen between
 * pings. Without it they see nothing until the driver's next update.
 */

/** Long enough to cover a gap in pings, short enough to expire with the ride. */
const POSITION_TTL_SECONDS = 120;

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  public constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  public async remember(location: DriverLocation): Promise<void> {
    try {
      await this.redis.set(
        key(location.rideId),
        JSON.stringify(location),
        'EX',
        POSITION_TTL_SECONDS,
      );
    } catch (cause) {
      /* A dropped position is not worth failing a socket message over —
         the next ping is a second away. */
      this.logger.warn(`Could not cache position: ${describe(cause)}`);
    }
  }

  public async lastKnown(rideId: string): Promise<DriverLocation | null> {
    try {
      const raw = await this.redis.get(key(rideId));
      if (raw === null) return null;

      const parsed = driverLocationSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch (cause) {
      this.logger.warn(`Could not read position: ${describe(cause)}`);
      return null;
    }
  }
}

function key(rideId: string): string {
  return `tracking:ride:${rideId}`;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'unknown error';
}
