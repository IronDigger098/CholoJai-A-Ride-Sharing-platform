import { type RateLimitDecision } from './rate-limit.types';

/**
 * Where request counts are kept.
 *
 * A port, for the usual reason plus one specific to this feature: the
 * guard's decision logic — which rules apply, how keys are built, what
 * happens when the store is down — is where the bugs with security
 * consequences live, and it must be testable without a Redis process.
 *
 * One method. Counting and deciding are the same operation and must not be
 * separable: a `read` followed by a `write` would let two concurrent
 * requests both observe "4 of 5 used" and both proceed.
 */
export interface RateLimitStore {
  /**
   * Record one request against `key` and say whether it is allowed.
   *
   * Implementations must never throw. A rate limiter that can raise an
   * exception into a request pipeline has turned a protective measure into
   * a new failure mode; report `unavailable` instead and let the caller
   * decide.
   */
  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitDecision>;
}

/** Injection token — an interface has no runtime value to key DI on. */
export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');
