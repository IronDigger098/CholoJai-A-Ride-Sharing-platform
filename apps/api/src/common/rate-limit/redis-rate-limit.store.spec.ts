import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import { RedisRateLimitStore } from './redis-rate-limit.store';

/**
 * Runs only when `REDIS_TEST_URL` is set.
 *
 * The Lua script is the one part of rate limiting that cannot be checked
 * with a fake — its whole purpose is to be atomic *inside Redis*, and a
 * TypeScript reimplementation would only prove that two versions of the
 * algorithm agree with each other. So this suite talks to a real server.
 *
 * Gated on an explicit environment variable rather than probing for a
 * connection, because a suite that quietly skips itself is a suite that
 * reports green while testing nothing. Set the variable locally, and the
 * CI integration job in M3.10 sets it against a service container:
 *
 * ```
 * REDIS_TEST_URL=redis://localhost:6379 pnpm --filter @cholojai/api test
 * ```
 *
 * Until that job exists, be honest about the status: on CI today these
 * assertions do not run.
 */
const REDIS_TEST_URL = process.env['REDIS_TEST_URL'];
const describeWithRedis =
  REDIS_TEST_URL === undefined ? describe.skip : describe;

describeWithRedis('RedisRateLimitStore (real Redis)', () => {
  let redis: Redis;
  let store: RedisRateLimitStore;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    redis = new Redis(REDIS_TEST_URL ?? '', { maxRetriesPerRequest: 1 });
    store = new RedisRateLimitStore(redis);
  });

  afterAll(async () => {
    await redis.quit();
    jest.restoreAllMocks();
  });

  /** A key nobody else is using, so suites can run in any order. */
  const freshKey = (): string => `rl:test:${randomUUID()}`;

  it('allows requests up to the limit and rejects the next one', async () => {
    const key = freshKey();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const decision = await store.consume(key, 3, 60_000);
      expect(decision.status).toBe('allowed');
    }

    expect((await store.consume(key, 3, 60_000)).status).toBe('limited');
  });

  it('counts down the remaining budget', async () => {
    const key = freshKey();

    const first = await store.consume(key, 5, 60_000);
    const second = await store.consume(key, 5, 60_000);

    expect(first).toMatchObject({ status: 'allowed', remaining: 4 });
    expect(second).toMatchObject({ status: 'allowed', remaining: 3 });
  });

  it('keeps separate keys separate', async () => {
    const a = freshKey();
    const b = freshKey();

    await store.consume(a, 1, 60_000);

    expect((await store.consume(a, 1, 60_000)).status).toBe('limited');
    expect((await store.consume(b, 1, 60_000)).status).toBe('allowed');
  });

  it('does not consume the budget on a rejected request', async () => {
    /* A rejected attempt must not push the window further out, or a caller
       who keeps hammering would extend their own lockout indefinitely —
       which sounds appealing and is actually a way to lock a victim out of
       their own account by spending their budget for them. */
    const key = freshKey();
    await store.consume(key, 1, 60_000);

    await store.consume(key, 1, 60_000);
    await store.consume(key, 1, 60_000);

    const counters = await redis.keys(`${key}:*`);
    const values = await Promise.all(counters.map((k) => redis.get(k)));

    expect(values.map(Number).reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it('is atomic under concurrent requests', async () => {
    /* The reason the check and the increment live in one Lua script. As
       four separate round trips, two callers both read "0 of 1 used" and
       both proceed. Twenty parallel requests against a limit of five must
       yield exactly five allowances. */
    const key = freshKey();

    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => store.consume(key, 5, 60_000)),
    );

    const allowed = decisions.filter((d) => d.status === 'allowed');
    expect(allowed).toHaveLength(5);
  });

  it('smooths the boundary instead of allowing a double burst', async () => {
    /* The flaw a fixed window has and this does not. With a 1-second
       window and a limit of 4, spending the budget just before the boundary
       must NOT hand over a fresh 4 immediately after it — a naive counter
       would allow 8 requests within a few milliseconds. */
    const key = freshKey();
    const windowMs = 1000;
    const limit = 4;

    // Land close to the end of the current window.
    const untilBoundary = windowMs - (Date.now() % windowMs);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, untilBoundary - 120)),
    );

    for (let attempt = 0; attempt < limit; attempt += 1) {
      await store.consume(key, limit, windowMs);
    }

    // Cross into the next window.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const afterBoundary: string[] = [];
    for (let attempt = 0; attempt < limit; attempt += 1) {
      afterBoundary.push((await store.consume(key, limit, windowMs)).status);
    }

    expect(afterBoundary).toContain('limited');
  });

  it('expires its counters instead of leaking keys', async () => {
    // A limiter that never forgets is a memory leak with a security story
    // attached.
    const key = freshKey();
    await store.consume(key, 5, 60_000);

    const counters = await redis.keys(`${key}:*`);
    expect(counters.length).toBeGreaterThan(0);

    for (const counter of counters) {
      const ttl = await redis.pttl(counter);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(120_000);
    }
  });

  it('reports unavailable rather than throwing when Redis is gone', async () => {
    /* The guard is on the path of every request. If this threw, a Redis
       blip would become a site-wide 500 instead of a logged degradation. */
    const offline = new Redis('redis://127.0.0.1:1', {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    offline.on('error', () => undefined);

    const offlineStore = new RedisRateLimitStore(offline);

    await expect(offlineStore.consume(freshKey(), 5, 60_000)).resolves.toEqual({
      status: 'unavailable',
    });

    offline.disconnect();
  });
});
