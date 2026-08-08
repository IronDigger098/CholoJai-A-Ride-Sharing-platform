/**
 * How a caller is identified for a given rule.
 *
 * `ip` is the fallback that always works but is the weakest: an office, a
 * university, or a mobile carrier can put thousands of people behind one
 * address, so an IP limit tight enough to stop one attacker also locks out
 * everyone sharing their NAT.
 *
 * `bodyField` keys on something the request itself claims — the email
 * address on a sign-in attempt. That is far more precise: it survives an
 * attacker rotating IPs, and it protects one account rather than one
 * network. It is also trivially forged, which is fine, because forging it
 * only spreads the attacker's own attempts across more buckets and does
 * nothing to help them reach a *particular* account.
 *
 * The two are complements, not alternatives. Sensitive endpoints use both.
 */
export type RateLimitKeySource = 'ip' | { readonly bodyField: string };

/** One limit applied to one endpoint. */
export interface RateLimitRule {
  /** Namespace for the Redis key and for log lines. Must be stable. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly by: RateLimitKeySource;
}

/**
 * The outcome of counting one request against one rule.
 *
 * `unavailable` is a first-class case rather than an exception, because
 * the correct response to it is a policy decision the caller must make
 * consciously — see `RateLimitGuard` for which way we chose and why.
 */
export type RateLimitDecision =
  | {
      readonly status: 'allowed';
      readonly limit: number;
      readonly remaining: number;
      /** Milliseconds until the window rolls over. */
      readonly resetMs: number;
    }
  | {
      readonly status: 'limited';
      readonly limit: number;
      readonly remaining: 0;
      readonly resetMs: number;
    }
  | { readonly status: 'unavailable' };
