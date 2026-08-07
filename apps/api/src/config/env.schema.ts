import { z } from 'zod';

/**
 * The complete environment contract for the API.
 *
 * Every variable the application will ever read is declared here. Nothing
 * else may touch `process.env` — see `AppConfigService`. Adding a variable
 * means updating three things in the same commit: this schema,
 * `.env.example`, and `docs/environment-variables.md`.
 *
 * Values arrive from the environment as strings, so numeric and boolean
 * fields are coerced and then range-checked. A malformed value is a startup
 * crash, not a runtime surprise.
 */

const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const;

/**
 * A URL that must actually speak HTTP.
 *
 * `z.string().url()` alone is not enough: the WHATWG URL parser accepts
 * `localhost:3000` as scheme `localhost:` with path `3000`, so the very
 * common typo of omitting `http://` would pass validation and then fail
 * confusingly at CORS time. The protocol check closes that hole.
 */
const httpUrl = z
  .string()
  .url('must be a valid URL including the scheme, e.g. http://localhost:3000')
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://'),
    { message: 'must start with http:// or https://' },
  );

export const envSchema = z
  .object({
    // ─── Runtime ────────────────────────────────────────────────────────
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

    // ─── Public origins ─────────────────────────────────────────────────
    API_BASE_URL: httpUrl,
    WEB_BASE_URL: httpUrl,

    // ─── Data stores ────────────────────────────────────────────────────
    DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value) =>
          value.startsWith('postgresql://') || value.startsWith('postgres://'),
        { message: 'must be a PostgreSQL connection string' },
      ),
    REDIS_URL: z
      .string()
      .min(1)
      .refine((value) => value.startsWith('redis://'), {
        message: 'must be a Redis connection string',
      }),

    // ─── Authentication ─────────────────────────────────────────────────
    /**
     * The HMAC key that signs access tokens.
     *
     * There is deliberately only one signing secret, because only one
     * token type is signed. Refresh tokens are opaque random strings
     * validated against the database, so they have no signature and need
     * no key — see `RefreshTokenService` for why.
     *
     * 32 characters minimum: an HS256 secret shorter than its own digest
     * is brute-forceable offline once an attacker holds a single token,
     * and forging a token then costs nothing.
     */
    JWT_ACCESS_SECRET: z
      .string()
      .min(
        32,
        'must be at least 32 characters — generate one, do not invent it',
      ),

    /**
     * Access tokens are short-lived because they cannot be revoked.
     *
     * A JWT is valid until it expires; there is no list to remove it from
     * without adding a database lookup to every request, which would
     * discard the reason for using a JWT at all. Fifteen minutes bounds
     * the damage from a stolen token while keeping refreshes infrequent.
     */
    JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),

    /** Refresh tokens ARE revocable — they live in the database. */
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

    /**
     * Cookie scope for the refresh token.
     *
     * `localhost` in development. In production this is the API's own
     * domain — never a parent domain shared with other services, which
     * would hand the cookie to every subdomain.
     */
    COOKIE_DOMAIN: z.string().min(1).default('localhost'),

    // ─── Mail ───────────────────────────────────────────────────────────
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
    MAIL_FROM: z.string().min(1),

    // ─── Rate limiting ──────────────────────────────────────────────────
    RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().positive().default(100),

    /**
     * Serve interactive API documentation at /api/docs.
     *
     * Unset means "on outside production, off in production" (resolved
     * below). Published docs enumerate every endpoint and payload shape,
     * which is a gift to anyone probing the service — so exposing them in
     * production must be a deliberate act, not a default. Set it to `true`
     * explicitly when public docs are the point, as they are for a
     * portfolio deployment.
     */
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value === 'true',
      ),
  })
  /**
   * Production-only guards.
   *
   * Defaults that are convenient in development are dangerous in
   * production, so we tighten the rules rather than trusting whoever
   * deploys to remember. A `superRefine` keeps every other field's errors
   * intact instead of short-circuiting on the first problem.
   */
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (!env.API_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_BASE_URL'],
        message: 'must use https in production',
      });
    }

    if (!env.WEB_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEB_BASE_URL'],
        message: 'must use https in production',
      });
    }

    /* The example file ships an obvious placeholder so a fresh clone runs.
       Shipping it to production would mean anyone who has read this public
       repository can forge an access token for any user, including an
       admin. A length check alone would not catch that: the placeholder is
       comfortably over 32 characters. */
    if (
      env.JWT_ACCESS_SECRET.includes('change-me') ||
      env.JWT_ACCESS_SECRET.includes('example')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message:
          'is still the placeholder from .env.example — generate a real secret',
      });
    }

    if (env.LOG_LEVEL === 'trace' || env.LOG_LEVEL === 'debug') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOG_LEVEL'],
        message:
          'debug/trace logging in production risks leaking request payloads',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export { NODE_ENVIRONMENTS, LOG_LEVELS };

/**
 * Thrown when the environment fails validation. Carries a formatted,
 * multi-line report so the operator sees every problem at once rather
 * than fixing one variable per restart.
 */
export class EnvValidationError extends Error {
  public constructor(public readonly issues: readonly z.ZodIssue[]) {
    const lines = issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      return `  • ${key}: ${issue.message}`;
    });
    super(
      `Invalid environment configuration:\n${lines.join('\n')}\n\n` +
        `Check your .env file against .env.example and ` +
        `docs/environment-variables.md.`,
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * Parse and validate an environment source.
 *
 * Pure and source-agnostic: tests pass a plain object rather than mutating
 * `process.env`, which keeps them isolated and parallel-safe.
 */
export function parseEnv(
  source: NodeJS.ProcessEnv | Record<string, unknown>,
): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }

  return result.data;
}
