import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.module';

import { type RateLimitStore } from './rate-limit-store.port';
import { type RateLimitDecision } from './rate-limit.types';

/**
 * Sliding-window counter, evaluated atomically inside Redis.
 *
 * **Why not a fixed window.** The obvious implementation is `INCR` on a key
 * named after the current minute, with an expiry. It is simple and it is
 * wrong at the edges: with a limit of 5 per minute, a caller can send 5 at
 * 11:00:59 and 5 more at 11:01:00 — ten requests in two seconds, each
 * window individually within its limit. For a login endpoint that is the
 * difference between throttling a password-guessing run and waving it
 * through in bursts.
 *
 * **Why not a sliding log.** Storing a timestamp per request and counting
 * those inside the window is exact, but the memory cost scales with
 * traffic, and traffic is precisely what spikes during an attack. A
 * mechanism whose cost grows with the abuse it is defending against is a
 * denial-of-service amplifier.
 *
 * **What this does instead.** Two counters — the current window and the
 * previous one — and the previous is weighted by how much of it still
 * overlaps the trailing window:
 *
 * ```
 *   estimate = previous × (1 − elapsed / windowMs) + current
 * ```
 *
 * Two keys and two integers per caller, no matter the request volume, and
 * the boundary burst is smoothed away. It is an approximation: it assumes
 * the previous window's requests were spread evenly through it, so a
 * caller who front-loads a window is measured slightly leniently. That
 * error is bounded and small, and it is the same trade Cloudflare's
 * limiter makes.
 *
 * **Why Lua.** `GET`, `GET`, compare, `INCR` as four round trips is a race:
 * two concurrent requests both read 4, both decide they may proceed, and
 * both increment to 6. Redis runs a script as a single atomic unit, so the
 * read-decide-write is indivisible. This is the same reasoning as the
 * conditional `UPDATE` behind refresh-token rotation — check and write must
 * be one operation or they are not a check at all.
 */
const SLIDING_WINDOW_SCRIPT = `
local currentKey  = KEYS[1]
local previousKey = KEYS[2]

local limit    = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local elapsed  = tonumber(ARGV[3])

local current  = tonumber(redis.call('GET', currentKey) or '0')
local previous = tonumber(redis.call('GET', previousKey) or '0')

-- How much of the previous window still falls inside the trailing window.
local overlap  = (windowMs - elapsed) / windowMs
local estimate = previous * overlap + current

if estimate + 1 > limit then
  return { 0, tostring(estimate) }
end

current = redis.call('INCR', currentKey)

-- Two windows must coexist for the weighting above to work, so a counter
-- outlives its own window. Set on every hit rather than only on creation:
-- one SET is cheaper than the branch, and it cannot leave a key immortal.
redis.call('PEXPIRE', currentKey, windowMs * 2)

return { 1, tostring(previous * overlap + current) }
`;

/** Redis-backed {@link RateLimitStore}. */
@Injectable()
export class RedisRateLimitStore implements RateLimitStore {
  private readonly logger = new Logger(RedisRateLimitStore.name);

  public constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  public async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    const windowIndex = Math.floor(now / windowMs);
    const elapsed = now % windowMs;
    const resetMs = windowMs - elapsed;

    try {
      const raw: unknown = await this.redis.eval(
        SLIDING_WINDOW_SCRIPT,
        2,
        `${key}:${windowIndex}`,
        `${key}:${windowIndex - 1}`,
        String(limit),
        String(windowMs),
        String(elapsed),
      );

      const parsed = parseScriptResult(raw);

      if (parsed === null) {
        this.logger.error('Rate-limit script returned an unexpected shape');
        return { status: 'unavailable' };
      }

      const remaining = Math.max(0, Math.floor(limit - parsed.estimate));

      return parsed.allowed
        ? { status: 'allowed', limit, remaining, resetMs }
        : { status: 'limited', limit, remaining: 0, resetMs };
    } catch (error: unknown) {
      /* Never rethrow. The guard is on the request path for every endpoint;
         an exception here would convert a Redis blip into a site-wide 500. */
      this.logger.warn(
        `Rate-limit check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { status: 'unavailable' };
    }
  }
}

/**
 * Narrow the script's reply.
 *
 * `eval` is typed `unknown` and its reply crosses a protocol boundary, so
 * it is parsed rather than asserted. The estimate comes back as a string
 * because Redis truncates Lua numbers to integers on the way out, and the
 * fractional part is the entire point of the weighting.
 */
function parseScriptResult(
  raw: unknown,
): { allowed: boolean; estimate: number } | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;

  const [allowedFlag, estimateText] = raw as [unknown, unknown];

  if (typeof allowedFlag !== 'number') return null;
  if (typeof estimateText !== 'string') return null;

  const estimate = Number.parseFloat(estimateText);
  if (Number.isNaN(estimate)) return null;

  return { allowed: allowedFlag === 1, estimate };
}
