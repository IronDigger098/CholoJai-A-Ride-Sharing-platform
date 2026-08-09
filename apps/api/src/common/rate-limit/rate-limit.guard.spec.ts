import { describe, expect, it, jest } from '@jest/globals';
import { type ExecutionContext, Logger } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';

import { makeTestConfig } from '../../testing/env.fixture';
import { InMemoryRateLimitStore } from '../../testing/in-memory-rate-limit.store';
import { RateLimitedError } from '../errors/domain-error';

import { RATE_LIMIT_RULES, SKIP_RATE_LIMIT } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { type RateLimitRule } from './rate-limit.types';

interface FakeResponse {
  headers: Record<string, number | string>;
  setHeader: (name: string, value: number | string) => void;
}

function makeResponse(): FakeResponse {
  const headers: Record<string, number | string> = {};
  return {
    headers,
    setHeader: (name, value) => {
      headers[name] = value;
    },
  };
}

/**
 * A minimal `ExecutionContext`.
 *
 * Hand-built rather than booted through Nest so these tests measure the
 * guard's own decisions — which rules apply, how keys are derived, what
 * each store outcome produces — instead of the framework's routing.
 */
function makeContext(options: {
  ip?: string | undefined;
  body?: unknown;
  rules?: RateLimitRule[] | undefined;
  skip?: boolean;
  response: FakeResponse;
}): ExecutionContext {
  const handler = (): void => undefined;

  return {
    getHandler: () => handler,
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({
        ip: options.ip ?? '203.0.113.7',
        body: options.body,
        method: 'POST',
        url: '/api/v1/auth/login',
      }),
      getResponse: () => options.response,
    }),
  } as unknown as ExecutionContext;
}

/** A Reflector that answers with whatever the test set up. */
function makeReflector(options: {
  rules?: RateLimitRule[] | undefined;
  skip?: boolean;
}): Reflector {
  return {
    get: (key: unknown) =>
      key === RATE_LIMIT_RULES ? options.rules : undefined,
    getAllAndOverride: (key: unknown) =>
      key === SKIP_RATE_LIMIT ? options.skip : undefined,
  } as unknown as Reflector;
}

function makeGuard(options: {
  rules?: RateLimitRule[] | undefined;
  skip?: boolean;
  config?: Record<string, string>;
}): { guard: RateLimitGuard; store: InMemoryRateLimitStore } {
  const store = new InMemoryRateLimitStore();

  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  return {
    guard: new RateLimitGuard(
      makeReflector(options),
      store,
      makeTestConfig(options.config ?? {}),
    ),
    store,
  };
}

const LOGIN_RULES: RateLimitRule[] = [
  {
    name: 'login-email',
    limit: 2,
    windowSeconds: 900,
    by: { bodyField: 'email' },
  },
  { name: 'login-ip', limit: 5, windowSeconds: 900, by: 'ip' },
];

describe('RateLimitGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('the global limit', () => {
    it('applies to a route that declares no rules of its own', async () => {
      // Protection is the default. An endpoint added without a decorator is
      // still counted, because the one someone forgets is always the new one.
      const { guard, store } = makeGuard({});
      const response = makeResponse();

      await guard.canActivate(makeContext({ response }));

      expect(store.seenKeys).toHaveLength(1);
      expect(store.seenKeys[0]).toMatch(/^rl:global-ip:/u);
    });

    it('rejects once the configured budget is spent', async () => {
      const { guard } = makeGuard({
        config: { RATE_LIMIT_GLOBAL_PER_MIN: '2' },
      });
      const response = makeResponse();

      await guard.canActivate(makeContext({ response }));
      await guard.canActivate(makeContext({ response }));

      await expect(
        guard.canActivate(makeContext({ response })),
      ).rejects.toThrow(RateLimitedError);
    });

    it('counts each IP separately', async () => {
      const { guard } = makeGuard({
        config: { RATE_LIMIT_GLOBAL_PER_MIN: '1' },
      });
      const response = makeResponse();

      await guard.canActivate(makeContext({ ip: '198.51.100.1', response }));

      await expect(
        guard.canActivate(makeContext({ ip: '198.51.100.1', response })),
      ).rejects.toThrow(RateLimitedError);

      await expect(
        guard.canActivate(makeContext({ ip: '198.51.100.2', response })),
      ).resolves.toBe(true);
    });
  });

  describe('per-route rules', () => {
    it('applies route rules in addition to the global one', async () => {
      const { guard, store } = makeGuard({ rules: LOGIN_RULES });
      const response = makeResponse();

      await guard.canActivate(
        makeContext({ body: { email: 'a@example.com' }, response }),
      );

      expect(store.seenKeys).toHaveLength(3);
    });

    it('limits by email independently of IP', async () => {
      /* The distributed-attack case: the same account hammered from many
         addresses. A per-IP rule alone would never notice. */
      const { guard } = makeGuard({ rules: LOGIN_RULES });
      const response = makeResponse();
      const body = { email: 'victim@example.com' };

      await guard.canActivate(
        makeContext({ ip: '198.51.100.1', body, response }),
      );
      await guard.canActivate(
        makeContext({ ip: '198.51.100.2', body, response }),
      );

      await expect(
        guard.canActivate(makeContext({ ip: '198.51.100.3', body, response })),
      ).rejects.toThrow(RateLimitedError);
    });

    it('lets a different account through on the same IP', async () => {
      // One user exhausting their own attempts must not lock out everyone
      // else behind the same office router.
      const { guard } = makeGuard({ rules: LOGIN_RULES });
      const response = makeResponse();

      await guard.canActivate(
        makeContext({ body: { email: 'a@example.com' }, response }),
      );
      await guard.canActivate(
        makeContext({ body: { email: 'a@example.com' }, response }),
      );

      await expect(
        guard.canActivate(
          makeContext({ body: { email: 'b@example.com' }, response }),
        ),
      ).resolves.toBe(true);
    });

    it('treats an email as the same identifier regardless of case', async () => {
      const { guard, store } = makeGuard({ rules: LOGIN_RULES });
      const response = makeResponse();

      await guard.canActivate(
        makeContext({ body: { email: 'Nabila@Example.com' }, response }),
      );
      await guard.canActivate(
        makeContext({ body: { email: ' nabila@example.com ' }, response }),
      );

      const emailKeys = store.seenKeys.filter((key) =>
        key.startsWith('rl:login-email:'),
      );
      expect(new Set(emailKeys).size).toBe(1);
    });

    it('skips a rule whose key cannot be built', async () => {
      // No email in the body: nothing to count per-email. The schema will
      // reject the request a moment later anyway.
      const { guard, store } = makeGuard({ rules: LOGIN_RULES });
      const response = makeResponse();

      await guard.canActivate(makeContext({ body: {}, response }));

      expect(
        store.seenKeys.some((key) => key.startsWith('rl:login-email:')),
      ).toBe(false);
    });
  });

  describe('privacy of the keys', () => {
    it('never puts an email address in a key', async () => {
      /* Redis keys surface in MONITOR output, memory analysers, and
         whatever a managed provider logs. Hashing costs a microsecond and
         means the limiter holds no personal data. */
      const { guard, store } = makeGuard({ rules: LOGIN_RULES });
      const response = makeResponse();

      await guard.canActivate(
        makeContext({ body: { email: 'nabila@example.com' }, response }),
      );

      expect(store.seenKeys.join(' ')).not.toContain('nabila@example.com');
      expect(store.seenKeys.join(' ')).not.toContain('example.com');
    });

    it('never puts a raw IP address in a key', async () => {
      const { guard, store } = makeGuard({});
      const response = makeResponse();

      await guard.canActivate(makeContext({ ip: '198.51.100.9', response }));

      expect(store.seenKeys.join(' ')).not.toContain('198.51.100.9');
    });
  });

  describe('response headers', () => {
    it('reports the limit, what is left, and when it resets', async () => {
      const { guard } = makeGuard({
        config: { RATE_LIMIT_GLOBAL_PER_MIN: '10' },
      });
      const response = makeResponse();

      await guard.canActivate(makeContext({ response }));

      expect(response.headers['RateLimit-Limit']).toBe(10);
      expect(response.headers['RateLimit-Remaining']).toBe(9);
      expect(response.headers['RateLimit-Reset']).toBe(60);
    });

    it('reports the rule closest to rejecting, not the loosest', async () => {
      /* Telling a client "97 remaining" from the global rule while the
         login rule is one attempt from cutting them off is worse than
         saying nothing. */
      const { guard } = makeGuard({
        rules: LOGIN_RULES,
        config: { RATE_LIMIT_GLOBAL_PER_MIN: '100' },
      });
      const response = makeResponse();

      await guard.canActivate(
        makeContext({ body: { email: 'a@example.com' }, response }),
      );

      expect(response.headers['RateLimit-Limit']).toBe(2);
      expect(response.headers['RateLimit-Remaining']).toBe(1);
    });

    it('sends Retry-After when it rejects', async () => {
      // The client is being asked to wait, not refused — so it must be told
      // how long.
      const { guard } = makeGuard({
        config: { RATE_LIMIT_GLOBAL_PER_MIN: '1' },
      });
      const response = makeResponse();

      await guard.canActivate(makeContext({ response }));
      await guard.canActivate(makeContext({ response })).catch(() => undefined);

      expect(response.headers['Retry-After']).toBe(60);
    });

    it('puts the wait in the error as well as the header', async () => {
      const { guard } = makeGuard({
        config: { RATE_LIMIT_GLOBAL_PER_MIN: '1' },
      });
      const response = makeResponse();
      await guard.canActivate(makeContext({ response }));

      try {
        await guard.canActivate(makeContext({ response }));
        throw new Error('expected a rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitedError);
        const limited = error as RateLimitedError;
        expect(limited.status).toBe(429);
        expect(limited.code).toBe('RATE_LIMITED');
        expect(limited.retryAfterSeconds).toBe(60);
      }
    });

    it('does not disclose which rule was hit', async () => {
      // Naming the rule would hand an attacker the exact shape of the wall
      // they need to stay under.
      const { guard } = makeGuard({
        rules: LOGIN_RULES,
        config: { RATE_LIMIT_GLOBAL_PER_MIN: '100' },
      });
      const response = makeResponse();
      const body = { email: 'a@example.com' };

      await guard.canActivate(makeContext({ body, response }));
      await guard.canActivate(makeContext({ body, response }));

      try {
        await guard.canActivate(makeContext({ body, response }));
        throw new Error('expected a rejection');
      } catch (error) {
        expect((error as Error).message).not.toContain('login-email');
        expect((error as Error).message).not.toContain('900');
      }
    });
  });

  describe('when the store is unavailable', () => {
    it('allows the request through', async () => {
      /* Fail open, deliberately. Rate limiting makes abuse expensive; it
         does not decide who may act. Failing closed would turn a Redis blip
         into a platform-wide sign-in outage — a strictly better outcome for
         an attacker than the abuse being prevented. */
      const { guard, store } = makeGuard({ rules: LOGIN_RULES });
      store.unavailable = true;
      const response = makeResponse();

      await expect(
        guard.canActivate(
          makeContext({ body: { email: 'a@example.com' }, response }),
        ),
      ).resolves.toBe(true);
    });

    it('logs a warning so the gap is alertable rather than silent', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const { guard, store } = makeGuard({});
      store.unavailable = true;

      await guard.canActivate(makeContext({ response: makeResponse() }));

      expect(warn).toHaveBeenCalled();
    });

    it('sets no rate-limit headers it cannot stand behind', async () => {
      const { guard, store } = makeGuard({});
      store.unavailable = true;
      const response = makeResponse();

      await guard.canActivate(makeContext({ response }));

      expect(response.headers['RateLimit-Limit']).toBeUndefined();
    });
  });

  describe('exemptions', () => {
    it('skips a route marked with @SkipRateLimit', async () => {
      const { guard, store } = makeGuard({ skip: true });

      await guard.canActivate(makeContext({ response: makeResponse() }));

      expect(store.seenKeys).toHaveLength(0);
    });

    it('does nothing at all when rate limiting is disabled', async () => {
      const { guard, store } = makeGuard({
        config: { RATE_LIMIT_ENABLED: 'false' },
      });

      await guard.canActivate(makeContext({ response: makeResponse() }));

      expect(store.seenKeys).toHaveLength(0);
    });
  });
});
