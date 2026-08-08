import { type RateLimitStore } from '../common/rate-limit/rate-limit-store.port';
import { type RateLimitDecision } from '../common/rate-limit/rate-limit.types';

/**
 * A rate-limit store with no Redis behind it.
 *
 * Counts with a plain fixed window rather than reimplementing the weighted
 * sliding window from the Lua script. That is deliberate: a second
 * implementation of the algorithm would be a second thing to keep correct,
 * and every guard test would then be silently asserting that the *fake*
 * agrees with itself. The guard's job is deciding which rules apply,
 * building keys, and reacting to each outcome — none of which depends on
 * how the count was arrived at.
 *
 * The sliding-window arithmetic is verified against a real Redis in
 * `redis-rate-limit.store.spec.ts`.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counts = new Map<string, number>();

  /** Flip on to simulate Redis being unreachable. */
  public unavailable = false;

  /** Every key this store was asked about, in order. */
  public readonly seenKeys: string[] = [];

  public async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitDecision> {
    this.seenKeys.push(key);

    if (this.unavailable) return { status: 'unavailable' };

    const used = (this.counts.get(key) ?? 0) + 1;

    if (used > limit) {
      return { status: 'limited', limit, remaining: 0, resetMs: windowMs };
    }

    this.counts.set(key, used);

    return {
      status: 'allowed',
      limit,
      remaining: limit - used,
      resetMs: windowMs,
    };
  }
}
