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

    /**
     * How long an individual refresh token lives — the *sliding* window.
     *
     * Refresh tokens ARE revocable, because they live in the database.
     * Rotation issues a new one on every use, so an active user's session
     * keeps sliding forward.
     */
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

    /**
     * The hard ceiling on one sign-in, regardless of activity.
     *
     * Without this, rotation would make sessions *less* bounded than they
     * were before it existed: refresh once a week and the session never
     * ends. Every successor's expiry is clamped to the family's start plus
     * this, so after thirty days the password is required again no matter
     * how active the account has been.
     */
    REFRESH_ABSOLUTE_TTL_DAYS: z.coerce.number().int().positive().default(30),

    /**
     * Grace period after a token is rotated, in seconds.
     *
     * A token replayed inside this window is treated as a concurrency
     * artefact rather than theft — two browser tabs, or a mobile client
     * retrying through a tunnel, can genuinely send the same token twice.
     * Without a grace period those users get signed out for nothing.
     *
     * It is a deliberate blind spot: an attacker replaying within the
     * window gets a 401 and raises no alarm. Ten seconds is short enough
     * that this costs almost nothing and long enough to cover a retry.
     * Set it to 0 to run strict, where any replay at all revokes the family.
     */
    REFRESH_ROTATION_GRACE_SECONDS: z.coerce.number().int().min(0).default(10),

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

    /**
     * SMTP credentials, optional because local development has none.
     *
     * Mailpit accepts anything and authenticates nobody, so requiring these
     * everywhere would mean inventing a username to satisfy a validator.
     * Every real provider requires them, which is why production demands
     * them below — an unauthenticated send to Resend or SES is not a
     * degraded mode, it is a rejected connection, and the failure surfaces
     * as "the verification email never arrived" rather than as a
     * misconfiguration anyone would look for.
     */
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),

    // ─── Geo / routing ──────────────────────────────────────────────────
    /**
     * OSRM instance used to measure routes.
     *
     * Defaults to the public demo server, which is fine for development and
     * unfit for production: it is rate-limited per address, offers no
     * availability guarantee, and asks that it not be used for anything
     * real. Deploying means pointing this at a self-hosted instance. The
     * default exists so a fresh clone runs, not so production can inherit it.
     */
    OSRM_BASE_URL: httpUrl.default('https://router.project-osrm.org'),

    /**
     * How long to wait for a route before giving up.
     *
     * Three seconds is generous for a routing query and short enough that a
     * hung provider does not hold a booking request open. Without a bound,
     * the slowest thing in the quote path has no ceiling at all.
     */
    OSRM_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

    /**
     * Route cache lifetime.
     *
     * Roads change on the timescale of months, so an hour is conservative;
     * the number is a bound on how long a closure takes to disappear from
     * quotes, not on correctness. Nothing here is priced from the cache
     * without being re-priced — the fare snapshot on a ride is taken at
     * booking (D2), so a stale route can never rewrite a completed receipt.
     */
    GEO_ROUTE_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(3600),

    /**
     * Nominatim instance used for place search and reverse lookup.
     *
     * The public instance, like OSRM's, is for development. Its usage policy
     * caps absolute request volume and forbids heavy use — a deployment
     * points this at a self-hosted instance or a commercial geocoder.
     */
    NOMINATIM_BASE_URL: httpUrl.default('https://nominatim.openstreetmap.org'),

    NOMINATIM_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

    /**
     * Sent as `User-Agent` on every geocoding request.
     *
     * Nominatim's policy requires an identifying agent and blocks anonymous
     * traffic outright, so this is a functional requirement rather than
     * courtesy.
     */
    NOMINATIM_USER_AGENT: z.string().min(1).default('CholoJai/0.1'),

    /**
     * How long a place lookup stays cached.
     *
     * Longer than routes: an address does not move. The bound exists so a
     * renamed or corrected place eventually propagates, not for correctness.
     */
    GEO_PLACE_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(86_400),

    // ─── Fares ──────────────────────────────────────────────────────────
    /**
     * How long a quote stays bookable.
     *
     * Short enough that a price cannot be held while conditions change, long
     * enough for a rider to read three options and choose. Five minutes; the
     * cost of expiry is one extra routing call, which is cached anyway.
     */
    FARE_QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    /**
     * The longest journey this platform will price.
     *
     * `estimateFare` is pure arithmetic and has no opinion about geography —
     * it will price a 400 km trip. Somebody has to hold that opinion, and a
     * configured ceiling keeps it out of the engine, where it would be a
     * business rule frozen into a function.
     */
    FARE_MAX_DISTANCE_METRES: z.coerce
      .number()
      .int()
      .positive()
      .default(100_000),

    // ─── Rate limiting ──────────────────────────────────────────────────
    RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().positive().default(100),

    /**
     * Master switch for rate limiting.
     *
     * Exists so a developer hammering an endpoint locally can turn it off
     * without editing code — and so that turning it off is a visible,
     * recorded act rather than a commented-out guard. Production refuses
     * to start with it disabled.
     */
    RATE_LIMIT_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),

    /**
     * How many reverse proxies sit in front of this process.
     *
     * Express only trusts `X-Forwarded-For` if you tell it to, and getting
     * this wrong breaks rate limiting in one of two ways. Too low, and
     * every request appears to come from the load balancer's IP, so the
     * global limit throttles the entire user base as if it were one
     * client. Too high, and a caller can forge extra hops and present any
     * IP they like, which makes per-IP limits meaningless.
     *
     * 0 for local development, where nothing is in front. Railway puts one
     * proxy in front, so production is 1. Count the hops; do not guess.
     */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

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
    /* Checked in every environment, not just production: a sliding window
       longer than the absolute ceiling is not a risky configuration, it is
       an incoherent one. The clamp would silently ignore REFRESH_TTL_DAYS
       and every token would expire at the ceiling, which is the kind of
       thing that gets diagnosed months later as "sessions feel wrong". */
    if (env.REFRESH_TTL_DAYS > env.REFRESH_ABSOLUTE_TTL_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REFRESH_TTL_DAYS'],
        message: `must not exceed REFRESH_ABSOLUTE_TTL_DAYS (${env.REFRESH_ABSOLUTE_TTL_DAYS})`,
      });
    }

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

    /* Both or neither, and in production both. A host with no credentials
       is the local Mailpit configuration pointed at a real provider, which
       connects and is refused — so registration succeeds, the email never
       arrives, and the account can never be verified. */
    if (env.SMTP_USER === undefined || env.SMTP_PASSWORD === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USER'],
        message:
          'SMTP_USER and SMTP_PASSWORD are both required in production — ' +
          'a real mail provider refuses unauthenticated connections',
      });
    }

    if (!env.RATE_LIMIT_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RATE_LIMIT_ENABLED'],
        message:
          'cannot be false in production — /auth/login runs argon2 on every attempt',
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
