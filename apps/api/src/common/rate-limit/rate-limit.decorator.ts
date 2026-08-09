import { SetMetadata } from '@nestjs/common';

import { type RateLimitRule } from './rate-limit.types';

export const RATE_LIMIT_RULES = 'rate-limit:rules';
export const SKIP_RATE_LIMIT = 'rate-limit:skip';

/**
 * Apply one or more rate-limit rules to a route.
 *
 * ```ts
 * @RateLimit(
 *   { name: 'login-email', limit: 5, windowSeconds: 900, by: { bodyField: 'email' } },
 *   { name: 'login-ip', limit: 20, windowSeconds: 900, by: 'ip' },
 * )
 * ```
 *
 * Rules are conjunctive: every one must allow the request. Listing two
 * with different key sources is the usual shape for anything sensitive —
 * the per-identifier rule protects one account from a distributed attack,
 * and the per-IP rule protects the service from one machine.
 *
 * These are *in addition to* the global per-IP limit, which the guard
 * applies everywhere. A route never opts out of the global limit by
 * declaring its own; it only adds tighter ones on top.
 */
export const RateLimit = (...rules: RateLimitRule[]): MethodDecorator =>
  SetMetadata(RATE_LIMIT_RULES, rules);

/**
 * Exempt a route from rate limiting entirely.
 *
 * For infrastructure endpoints only. A load balancer polling `/health`
 * every second from one address would otherwise exhaust the global limit
 * and take the instance out of rotation — the probe would cause the
 * outage it exists to detect.
 *
 * Never use this to make a business endpoint convenient.
 */
export const SkipRateLimit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_RATE_LIMIT, true);
