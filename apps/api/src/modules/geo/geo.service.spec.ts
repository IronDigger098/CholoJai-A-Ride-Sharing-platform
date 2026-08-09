import { describe, expect, it } from '@jest/globals';
import { type Redis } from 'ioredis';

import { makeTestConfig } from '../../testing/env.fixture';
import { InMemoryRoutingProvider } from '../../testing/in-memory-routing.provider';

import { RouteNotFoundError } from './geo.errors';
import { GeoService } from './geo.service';

/**
 * A Redis stand-in with just the two commands this service uses.
 *
 * Not promoted to `src/testing/`: `contributing.md` forbids an abstraction
 * without a second caller, and GeoService is currently the only thing that
 * talks to Redis directly rather than through a port. If a second consumer
 * appears, that is the signal a `CachePort` was the missing piece — and this
 * fake is what should become it.
 *
 * Failures are constructor flags rather than `jest.spyOn`. ioredis types
 * `get` and `set` with a long list of overloads, so spying through the cast
 * this fake needs does not typecheck — and a flag states the intent of the
 * test more plainly than a mock implementation does anyway.
 */
interface FakeRedis {
  readonly client: Redis;
  readonly store: Map<string, string>;
}

function makeFakeRedis(
  fails: { read?: boolean; write?: boolean } = {},
): FakeRedis {
  const store = new Map<string, string>();

  const client = {
    get: (key: string): Promise<string | null> =>
      fails.read === true
        ? Promise.reject(new Error('connection refused'))
        : Promise.resolve(store.get(key) ?? null),
    set: (key: string, value: string): Promise<'OK'> => {
      if (fails.write === true) {
        return Promise.reject(new Error('connection refused'));
      }
      store.set(key, value);
      return Promise.resolve('OK');
    },
  };

  return { client: client as unknown as Redis, store };
}

const DHANMONDI = { lat: 23.7461, lng: 90.376 };
const BANANI = { lat: 23.7936, lng: 90.4043 };

describe('GeoService', () => {
  it('returns the provider measurement on a cache miss', async () => {
    const provider = new InMemoryRoutingProvider();
    const redis = makeFakeRedis();
    const service = new GeoService(provider, redis.client, makeTestConfig());

    const route = await service.route(DHANMONDI, BANANI);

    expect(route.distanceMetres).toBeGreaterThan(0);
    expect(route.durationSeconds).toBeGreaterThan(0);
    expect(provider.calls).toBe(1);
  });

  it('serves a repeat journey from cache', async () => {
    /* Routing is the slowest thing in the quote path and the only part that
       leaves the network. A rider comparing vehicle types re-quotes the same
       journey several times in a row; each one must not cost an upstream
       request. */
    const provider = new InMemoryRoutingProvider();
    const redis = makeFakeRedis();
    const service = new GeoService(provider, redis.client, makeTestConfig());

    const first = await service.route(DHANMONDI, BANANI);
    const second = await service.route(DHANMONDI, BANANI);

    expect(second).toEqual(first);
    expect(provider.calls).toBe(1);
  });

  it('treats points within the grid tolerance as the same journey', async () => {
    /* Keys are built at four decimal places — about 11 metres, which is
       inside the error of a phone's GPS fix. Two pins that close were, as
       far as anything can tell, dropped on the same spot. */
    const provider = new InMemoryRoutingProvider();
    const redis = makeFakeRedis();
    const service = new GeoService(provider, redis.client, makeTestConfig());

    await service.route(DHANMONDI, BANANI);
    await service.route(
      { lat: DHANMONDI.lat + 0.000_01, lng: DHANMONDI.lng },
      BANANI,
    );

    expect(provider.calls).toBe(1);
  });

  it('does not serve the return leg from the outbound cache entry', async () => {
    /* One-way streets and turn restrictions make A→B and B→A genuinely
       different drives. Collapsing the pair would quote one at the other's
       price, and the error would be invisible because both numbers look
       entirely plausible. */
    const provider = new InMemoryRoutingProvider();
    const redis = makeFakeRedis();
    const service = new GeoService(provider, redis.client, makeTestConfig());

    await service.route(DHANMONDI, BANANI);
    await service.route(BANANI, DHANMONDI);

    expect(provider.calls).toBe(2);
  });

  describe('when Redis is unavailable', () => {
    /* A cache that can fail the request it exists to speed up is not a
       cache. Both directions are covered because they fail differently: a
       broken read must fall through to the provider, and a broken write must
       not discard a route that was already fetched successfully. */

    it('still answers when the read fails', async () => {
      const provider = new InMemoryRoutingProvider();
      const redis = makeFakeRedis({ read: true });
      const service = new GeoService(provider, redis.client, makeTestConfig());

      const route = await service.route(DHANMONDI, BANANI);

      expect(route.distanceMetres).toBeGreaterThan(0);
      expect(provider.calls).toBe(1);
    });

    it('still answers when the write fails', async () => {
      const provider = new InMemoryRoutingProvider();
      const redis = makeFakeRedis({ write: true });
      const service = new GeoService(provider, redis.client, makeTestConfig());

      const route = await service.route(DHANMONDI, BANANI);

      expect(route.distanceMetres).toBeGreaterThan(0);
    });
  });

  it('ignores a cached value it cannot parse', async () => {
    /* Left by an older version of this code, or by something else using the
       same key. Treating it as a miss is the only safe reading — the
       alternative is pricing a ride from a shape nobody validated. */
    const provider = new InMemoryRoutingProvider();
    const redis = makeFakeRedis();
    const service = new GeoService(provider, redis.client, makeTestConfig());

    await service.route(DHANMONDI, BANANI);
    for (const key of redis.store.keys()) {
      redis.store.set(key, '{"distanceMetres":"not a number"}');
    }
    await service.route(DHANMONDI, BANANI);

    expect(provider.calls).toBe(2);
  });

  it('propagates a routing failure rather than caching it', async () => {
    const provider = new InMemoryRoutingProvider();
    provider.markUnreachable(BANANI);
    const redis = makeFakeRedis();
    const service = new GeoService(provider, redis.client, makeTestConfig());

    /* The type, not the message. `problem-details.ts` is explicit that
       `detail` is human-facing and translatable and must never be switched
       on — a test that matches it is the same mistake in test form, and it
       breaks the day the wording changes or a Bangla translation lands. */
    await expect(service.route(DHANMONDI, BANANI)).rejects.toThrow(
      RouteNotFoundError,
    );
    expect(redis.store.size).toBe(0);
  });
});
