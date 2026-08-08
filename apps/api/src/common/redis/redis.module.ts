import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigService } from '../../config/app-config.service';

/** DI token for the shared Redis connection. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Give up on a command rather than queue it forever.
 *
 * ioredis's default is to buffer commands while disconnected and replay
 * them on reconnect. For a cache or a rate limiter that is the wrong
 * behaviour: a request should get a fast "no answer" and carry on, not
 * hang until Redis returns. A rate-limit check that blocks for thirty
 * seconds has become the outage it was meant to prevent.
 */
const MAX_RETRIES_PER_REQUEST = 1;
const CONNECT_TIMEOUT_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 5_000;

/**
 * The application's Redis connection.
 *
 * Redis and its configuration have been in `docker-compose.yml` and the env
 * schema since M2, deliberately unused: `contributing.md` forbids adding an
 * abstraction before it has a caller, and rate limiting in M3.6 is the
 * first thing that genuinely needs a shared, expiring counter that survives
 * a process restart and is consistent across instances.
 *
 * The connection is *lazy and non-fatal*. If Redis is unreachable at boot
 * the application still starts, because nothing it does is essential to
 * serving a request — see `RateLimitGuard` for what happens then. A cache
 * that can take the whole service down with it is not a cache, it is a
 * single point of failure wearing a friendly name.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Redis => {
        const logger = new Logger('RedisClient');

        const client = new Redis(config.redisUrl, {
          lazyConnect: false,
          maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
          connectTimeout: CONNECT_TIMEOUT_MS,
          enableOfflineQueue: false,
          retryStrategy: (attempt) =>
            Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS),
        });

        /* An unhandled 'error' event on an ioredis client crashes the
           process. Subscribing is not optional politeness — it is what
           turns "Redis restarted" from an outage into a log line. */
        client.on('error', (error: Error) => {
          logger.warn(`Redis unavailable: ${error.message}`);
        });

        client.on('ready', () => {
          logger.log('Redis connection established');
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  public constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * Close the connection on SIGTERM.
   *
   * `quit` drains in-flight commands before closing; `disconnect` would
   * drop them mid-write. Nothing here is logged with the connection URL —
   * a Redis URL carries a password, and an operator reading logs has no
   * need for it.
   */
  public async onApplicationShutdown(): Promise<void> {
    /* `quit` only makes sense on a live connection: it sends QUIT and waits
       for the server to acknowledge. Called on a client that never
       connected — Redis was down the whole time, and the retry strategy is
       still trying — it waits forever, and SIGTERM never completes. The
       orchestrator then hard-kills the process after its grace period,
       which is exactly the unclean shutdown `enableShutdownHooks` exists to
       avoid. `disconnect` is synchronous and also stops the reconnection
       loop, so it is the right tool whenever the socket is not ready. */
    if (this.client.status !== 'ready') {
      this.client.disconnect();
      return;
    }

    try {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    } catch {
      // Lost between the status check and the QUIT. Drop it and move on:
      // a noisy failure here buries the real reason the process is stopping.
      this.client.disconnect();
    }
  }
}
