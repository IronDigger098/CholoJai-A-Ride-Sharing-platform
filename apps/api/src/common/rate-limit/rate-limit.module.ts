import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { RATE_LIMIT_STORE } from './rate-limit-store.port';
import { RateLimitGuard } from './rate-limit.guard';
import { RedisRateLimitStore } from './redis-rate-limit.store';

/**
 * Rate limiting, applied to every route.
 *
 * `APP_GUARD` registers the guard globally *through the DI container*,
 * which is why it is a provider here rather than an `app.useGlobalGuards()`
 * call in main.ts — the latter constructs the guard by hand and cannot
 * inject the store or the config.
 *
 * Global so that protection is the default. Routes tighten it with
 * `@RateLimit()` and infrastructure endpoints opt out with
 * `@SkipRateLimit()`; nothing is unprotected by omission.
 */
@Global()
@Module({
  providers: [
    { provide: RATE_LIMIT_STORE, useClass: RedisRateLimitStore },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [RATE_LIMIT_STORE],
})
export class RateLimitModule {}
