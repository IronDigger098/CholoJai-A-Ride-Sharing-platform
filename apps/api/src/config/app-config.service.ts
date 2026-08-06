import { Injectable } from '@nestjs/common';

import { type Env } from './env.schema';

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
