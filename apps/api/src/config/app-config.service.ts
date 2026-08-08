import { Injectable } from '@nestjs/common';

import { type Env } from './env.schema';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The only object in the application permitted to expose configuration.
 *
 * Injecting this instead of reading `process.env` gives three things:
 * every value is already validated and correctly typed (no
 * `string | undefined` and no non-null assertions), tests can construct a
 * service with a fixture instead of mutating global state, and a single
 * `grep` reveals every configuration consumer.
 *
 * `@nestjs/config`'s `ConfigService` was the alternative. It returns
 * `T | undefined` for every key unless you fight it with generics, and it
 * validates lazily. Owning ~30 lines is cheaper than working around a
 * dependency whose main feature — loading .env — Node now does natively.
 */
@Injectable()
export class AppConfigService {
  public constructor(private readonly env: Env) {}

  public get nodeEnv(): Env['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  public get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  public get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  public get port(): number {
    return this.env.PORT;
  }

  public get logLevel(): Env['LOG_LEVEL'] {
    return this.env.LOG_LEVEL;
  }

  public get apiBaseUrl(): string {
    return this.env.API_BASE_URL;
  }

  public get webBaseUrl(): string {
    return this.env.WEB_BASE_URL;
  }

  public get databaseUrl(): string {
    return this.env.DATABASE_URL;
  }

  public get redisUrl(): string {
    return this.env.REDIS_URL;
  }

  /**
   * Access-token signing key and lifetime.
   *
   * `issuer` and `audience` are checked on every verification. They cost
   * nothing and mean a token minted by some other service that happens to
   * share this secret cannot be replayed here.
   */
  public get accessToken(): {
    secret: string;
    ttlSeconds: number;
    issuer: string;
    audience: string;
  } {
    return {
      secret: this.env.JWT_ACCESS_SECRET,
      ttlSeconds: this.env.JWT_ACCESS_TTL_MINUTES * 60,
      issuer: 'cholojai-api',
      audience: 'cholojai-web',
    };
  }

  /**
   * Refresh-token lifetime rules. There is no secret: the token is opaque.
   *
   * Returned in milliseconds because every consumer does date arithmetic
   * with it. Converting once here means no call site multiplies by 86_400_000
   * and gets a zero wrong.
   */
  public get refreshPolicy(): {
    slidingTtlMs: number;
    absoluteTtlMs: number;
    rotationGraceMs: number;
  } {
    return {
      slidingTtlMs: this.env.REFRESH_TTL_DAYS * MS_PER_DAY,
      absoluteTtlMs: this.env.REFRESH_ABSOLUTE_TTL_DAYS * MS_PER_DAY,
      rotationGraceMs: this.env.REFRESH_ROTATION_GRACE_SECONDS * 1000,
    };
  }

  /**
   * Cookie attributes for the refresh token.
   *
   * `httpOnly` puts it beyond JavaScript's reach, so an XSS payload cannot
   * read it. `secure` requires HTTPS in production. `sameSite: 'strict'`
   * means the browser never attaches it to a cross-site request, which is
   * what closes the CSRF hole that cookie auth would otherwise open.
   *
   * The `__Host-` cookie prefix was considered and rejected: it is a
   * stronger binding to the exact host, but it *requires* `Path=/`, and we
   * would rather scope the path than have the browser send this cookie to
   * every endpoint on the API.
   */
  public get refreshCookie(): {
    httpOnly: true;
    secure: boolean;
    sameSite: 'strict';
    domain: string;
    path: string;
    maxAge: number;
  } {
    return {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      domain: this.env.COOKIE_DOMAIN,
      /* Scoped to the one endpoint that consumes it. The browser will not
         attach this cookie to any other request, so an XSS payload cannot
         ride it to /rides or /admin even though it cannot read the value. */
      path: '/api/v1/auth',
      /* The sliding window, not the absolute ceiling: rotation replaces
         this cookie on every refresh, so it only ever has to outlive one
         token. Using the ceiling here would leave the browser sending a
         credential that died three weeks earlier. */
      maxAge: this.refreshPolicy.slidingTtlMs,
    };
  }

  public get mail(): { host: string; port: number; from: string } {
    return {
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT,
      from: this.env.MAIL_FROM,
    };
  }

  public get rateLimitGlobalPerMinute(): number {
    return this.env.RATE_LIMIT_GLOBAL_PER_MIN;
  }

  public get rateLimitEnabled(): boolean {
    return this.env.RATE_LIMIT_ENABLED;
  }

  /** Reverse-proxy hops Express should trust for `X-Forwarded-For`. */
  public get trustedProxyHops(): number {
    return this.env.TRUSTED_PROXY_HOPS;
  }

  /**
   * Whether to serve interactive API docs.
   *
   * Defaults to on outside production and off in production — safe by
   * default, overridable by an explicit `SWAGGER_ENABLED`. Publishing the
   * full endpoint surface is a legitimate choice for a public API; it must
   * just be a choice rather than an oversight.
   */
  public get swaggerEnabled(): boolean {
    return this.env.SWAGGER_ENABLED ?? !this.isProduction;
  }

  /**
   * Origins permitted by CORS.
   *
   * An explicit allow-list, never `*`. Wildcard CORS combined with
   * credentialed requests is one of the most common real-world
   * misconfigurations, and browsers reject the combination anyway.
   */
  public get corsOrigins(): readonly string[] {
    return [this.env.WEB_BASE_URL];
  }
}
