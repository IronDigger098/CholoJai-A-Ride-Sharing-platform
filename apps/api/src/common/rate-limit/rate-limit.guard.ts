import { createHash } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request, type Response } from 'express';

import { AppConfigService } from '../../config/app-config.service';
import { RateLimitedError } from '../errors/domain-error';

import { RATE_LIMIT_STORE, type RateLimitStore } from './rate-limit-store.port';
import { RATE_LIMIT_RULES, SKIP_RATE_LIMIT } from './rate-limit.decorator';
import {
  type RateLimitDecision,
  type RateLimitKeySource,
  type RateLimitRule,
} from './rate-limit.types';

/** Length of the hashed identifier kept in a Redis key. */
const KEY_DIGEST_LENGTH = 32;

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

/**
 * Counts every request and rejects the ones over a limit.
 *
 * Registered globally, so protection is the default and exemption is the
 * explicit act. The opposite arrangement — opt in per route — means the
 * endpoint someone forgets is the endpoint that is unprotected, and it is
 * always the new one written in a hurry.
 *
 * ## Fail open, deliberately
 *
 * When Redis cannot answer, requests are **allowed**. That is a real
 * decision with a real cost, so it is worth stating plainly.
 *
 * Failing closed would mean that losing Redis stops every sign-in, every
 * registration, and every refresh across the whole platform. Rate limiting
 * is a protective measure, not an authorisation control: it exists to make
 * abuse expensive, not to decide who may act. Letting it take the service
 * down converts a degraded cache into a total outage, and an attacker who
 * can disrupt Redis gets a far better result than the abuse the limiter
 * was stopping.
 *
 * The cost is that a Redis outage is also a window with no throttling. That
 * is why the failure logs at `warn` with the rule name — it must be
 * alertable, not silent. Genuine authorisation (`JwtAuthGuard`, and the
 * role checks in M3.7) fails closed; this does not, and the difference is
 * the difference between "who are you" and "how often".
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  public constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    private readonly config: AppConfigService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.rateLimitEnabled) return true;

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(
      SKIP_RATE_LIMIT,
      [context.getHandler(), context.getClass()],
    );
    if (skip === true) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const rules = [
      this.globalRule(),
      ...(this.reflector.get<RateLimitRule[] | undefined>(
        RATE_LIMIT_RULES,
        context.getHandler(),
      ) ?? []),
    ];

    /* Evaluated in order and short-circuited on the first rejection. The
       global rule is checked first on purpose: it is the cheapest and the
       most likely to catch a flood, and rejecting early means an abusive
       caller costs us one Redis round trip instead of three. */
    let tightest: RateLimitDecision | null = null;

    for (const rule of rules) {
      const identifier = this.identifierFor(rule.by, request);

      // A rule whose key cannot be built does not apply. A sign-in request
      // with no email in the body has nothing to count per-email; the
      // schema will reject it a moment later anyway.
      if (identifier === null) continue;

      const decision = await this.store.consume(
        buildKey(rule.name, identifier),
        rule.limit,
        rule.windowSeconds * MS_PER_SECOND,
      );

      if (decision.status === 'unavailable') {
        this.logger.warn(
          `Rate limiting is degraded: the store did not answer for rule "${rule.name}"`,
        );
        continue;
      }

      if (decision.status === 'limited') {
        this.applyHeaders(response, decision);

        const retryAfterSeconds = Math.ceil(decision.resetMs / MS_PER_SECOND);
        response.setHeader('Retry-After', retryAfterSeconds);

        this.logger.warn(
          `Rate limit "${rule.name}" exceeded on ${request.method} ${request.url}`,
        );

        throw new RateLimitedError(retryAfterSeconds);
      }

      if (tightest === null || decision.remaining < remainingOf(tightest)) {
        tightest = decision;
      }
    }

    /* Report the rule closest to rejecting, not the loosest one. A client
       that reads `RateLimit-Remaining: 97` from the global rule while the
       login rule is one attempt from cutting it off has been told nothing
       useful. */
    if (tightest !== null) this.applyHeaders(response, tightest);

    return true;
  }

  /** The limit every request is subject to, from configuration. */
  private globalRule(): RateLimitRule {
    return {
      name: 'global-ip',
      limit: this.config.rateLimitGlobalPerMinute,
      windowSeconds: SECONDS_PER_MINUTE,
      by: 'ip',
    };
  }

  /**
   * Work out what to count this request against.
   *
   * Returns `null` when the rule cannot be applied — a missing body field,
   * or an IP Express could not determine.
   */
  private identifierFor(
    source: RateLimitKeySource,
    request: Request,
  ): string | null {
    if (source === 'ip') {
      /* `request.ip` honours X-Forwarded-For only as far as the configured
         trust-proxy setting allows. That setting is load-bearing: too low
         and every caller looks like the load balancer, so one limit
         throttles everyone; too high and a caller forges the header and
         picks their own bucket. See TRUSTED_PROXY_HOPS. */
      return request.ip ?? null;
    }

    const body: unknown = request.body;
    if (typeof body !== 'object' || body === null) return null;

    const value = (body as Record<string, unknown>)[source.bodyField];

    return typeof value === 'string' && value.length > 0
      ? value.trim().toLowerCase()
      : null;
  }

  private applyHeaders(response: Response, decision: RateLimitDecision): void {
    if (decision.status === 'unavailable') return;

    /* The IETF draft header set. Clients that understand them can back off
       before being rejected, which is better for everyone than discovering
       the limit by hitting it. */
    response.setHeader('RateLimit-Limit', decision.limit);
    response.setHeader('RateLimit-Remaining', decision.remaining);
    response.setHeader(
      'RateLimit-Reset',
      Math.ceil(decision.resetMs / MS_PER_SECOND),
    );
  }
}

function remainingOf(decision: RateLimitDecision): number {
  return decision.status === 'unavailable'
    ? Number.MAX_SAFE_INTEGER
    : decision.remaining;
}

/**
 * Build the Redis key for a rule and a caller.
 *
 * The identifier is hashed rather than stored as-is. Redis keys turn up in
 * `MONITOR` output, in `KEYS` dumps, in memory analysers, and in whatever a
 * managed provider logs — and for the rules that matter most, the
 * identifier is a user's email address. Hashing costs a microsecond and
 * means the rate limiter holds no personal data at all.
 *
 * Truncated to 32 hex characters: 128 bits, far beyond any collision risk
 * at this scale, and it keeps keys short enough to read.
 */
function buildKey(ruleName: string, identifier: string): string {
  const digest = createHash('sha256')
    .update(identifier, 'utf8')
    .digest('hex')
    .slice(0, KEY_DIGEST_LENGTH);

  return `rl:${ruleName}:${digest}`;
}
