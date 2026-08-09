import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ConfigModule } from '../../config/config.module';
import { makeTestEnv } from '../../testing/env.fixture';
import { RateLimitModule } from '../rate-limit/rate-limit.module';

import { RedisModule } from './redis.module';

/** A port nothing is listening on, so the client can never connect. */
const UNREACHABLE = 'redis://127.0.0.1:1';

/**
 * Starting and stopping with Redis unavailable.
 *
 * This suite exists because of a defect it caught. Rate limiting is
 * designed to degrade rather than fail, but "degrade" has to include the
 * process lifecycle: an application that cannot boot without Redis, or
 * cannot shut down without it, has made the cache mandatory by accident
 * however carefully the request path fails open.
 *
 * The failure was invisible in ordinary use. `init()` was always fast; it
 * was `close()` that hung, because `quit()` waits for an acknowledgement
 * from a server that was never there. In production the symptom would have
 * been SIGTERM never completing and the orchestrator hard-killing the
 * process after its grace period — mid-request, on every deploy.
 */
describe('RedisModule when Redis is unreachable', () => {
  it('boots and shuts down without hanging', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(makeTestEnv({ REDIS_URL: UNREACHABLE })),
        RedisModule,
        RateLimitModule,
      ],
    }).compile();

    const app = moduleRef.createNestApplication();

    await app.init();
    /* If this hangs, the test times out — which is the whole point. Jest
       reporting a timeout here is a genuine production signal, not a slow
       test. */
    await app.close();

    expect(true).toBe(true);
    jest.restoreAllMocks();
  }, 15_000);
});
