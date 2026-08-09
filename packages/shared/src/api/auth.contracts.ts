import { z } from 'zod';

import { UserRole } from '../domain/roles';

/**
 * Authentication contracts — the single definition of every auth request
 * and response shape (ADR-005).
 *
 * Each schema here has three consumers: React Hook Form validates the
 * browser form against it, the API rejects bad requests with it, and
 * Swagger documents the endpoint from it. Writing the rules once is the
 * whole reason this monorepo exists — a rule that lives in two places will
 * eventually disagree with itself.
 */

/**
 * Password policy.
 *
 * Length is the dominant factor in password strength, so the minimum is 12
 * rather than the traditional 8. Composition rules ("one uppercase, one
 * digit, one symbol") are deliberately NOT enforced: NIST SP 800-63B
 * advises against them because they push users toward predictable
 * substitutions like `Password1!` while blocking genuinely strong
 * passphrases. A long passphrase beats a short scrambled word.
 *
 * The 128-character ceiling is a denial-of-service guard, not a security
 * rule — argon2 hashing cost grows with input, and an unbounded password
 * field is an unbounded amount of work per request.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters');

/**
 * Email, normalised to lowercase.
 *
 * The transform runs before uniqueness is checked, so `Nabila@Example.com`
 * and `nabila@example.com` cannot become two accounts. Without this the
 * database's unique index is case-sensitive and would happily allow both.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254, 'Email address is too long'); // RFC 5321 maximum

/**
 * Bangladeshi mobile number, stored in a single canonical form.
 *
 * Accepts the ways people actually type it — `01712345678`,
 * `+8801712345678`, `8801712345678` — and normalises to `+8801712345678`.
 * Normalising at the boundary means every downstream comparison, lookup,
 * and SMS send works on one format instead of guessing.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+?88)?01[3-9]\d{8}$/u,
    'Enter a valid Bangladeshi mobile number, e.g. 01712345678',
  )
  .transform((value) => {
    const digits = value.replace(/\D/gu, '');
    const local = digits.startsWith('88') ? digits.slice(2) : digits;
    return `+88${local}`;
  });

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters');

/* ────────────────────────────────────────────────────────────────────────
   POST /auth/register
   ──────────────────────────────────────────────────────────────────────── */

export const registerRequestSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * The public view of a user.
 *
 * Deliberately narrow. `passwordHash` and `deletedAt` exist on the database
 * row and must never leave the server — defining the response shape
 * explicitly, rather than returning the entity, makes leaking a field a
 * deliberate act rather than an oversight.
 */
export const userSummarySchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  emailVerified: z.boolean(),
  roles: z.array(z.nativeEnum(UserRole)),
  createdAt: z.string().datetime(),
});

export type UserSummary = z.infer<typeof userSummarySchema>;

export const registerResponseSchema = z.object({
  user: userSummarySchema,
  /** Guidance for the client: tell the user to check their inbox. */
  emailVerificationRequired: z.literal(true),
});

export type RegisterResponse = z.infer<typeof registerResponseSchema>;

/* ────────────────────────────────────────────────────────────────────────
   POST /auth/verify-email
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The token arrives in the request body, not the URL.
 *
 * A token in a query string leaks: it lands in browser history, in server
 * access logs, and in the `Referer` header sent to any third-party asset
 * the confirmation page loads. The email link points at a *web page*, which
 * reads the token from its own query string and POSTs it here — so the
 * secret spends its life in one hop rather than in every log along the way.
 */
export const verifyEmailRequestSchema = z.object({
  token: z
    .string()
    .min(20, 'Verification token is malformed')
    .max(200, 'Verification token is malformed'),
});

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const verifyEmailResponseSchema = z.object({
  user: userSummarySchema,
});

export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

/* ────────────────────────────────────────────────────────────────────────
   POST /auth/resend-verification
   ──────────────────────────────────────────────────────────────────────── */

export const resendVerificationRequestSchema = z.object({
  email: emailSchema,
});

export type ResendVerificationRequest = z.infer<
  typeof resendVerificationRequestSchema
>;

/* ────────────────────────────────────────────────────────────────────────
   POST /auth/login
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Sign-in credentials.
 *
 * Note what is NOT reused here: `passwordSchema`. Applying the 12-character
 * minimum to a login form would reject a correct password the moment the
 * policy tightened, telling an existing user that their own password is
 * invalid. Policy belongs on the endpoints that *set* a password; the
 * endpoint that checks one needs only enough validation to bound the work
 * it will do — hence the length ceiling, which is a denial-of-service
 * guard on argon2, not a rule about passwords.
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * What a successful sign-in returns.
 *
 * The refresh token is conspicuously absent. It travels only in an
 * httpOnly cookie that the browser attaches automatically, so JavaScript
 * never holds it and an XSS payload has nothing to read. Putting it in this
 * body would hand it straight back to the code we are defending against.
 *
 * The access token, by contrast, IS in the body: the client keeps it in
 * memory and sends it as `Authorization: Bearer …`. That asymmetry is the
 * whole design — the credential reachable by script lives fifteen minutes,
 * and the one that lives a week is unreachable by script.
 */
export const loginResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  /** Seconds until `accessToken` expires — lets the client refresh early. */
  expiresIn: z.number().int().positive(),
  user: userSummarySchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/* ────────────────────────────────────────────────────────────────────────
   POST /auth/refresh
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Refreshing returns exactly what signing in returns.
 *
 * Aliased rather than redefined, and that is the contract: a client can
 * feed both responses through one handler, because after a refresh the
 * session is in the same state as after a sign-in — new access token, new
 * refresh cookie, current user. If these ever need to diverge, the alias
 * is where that decision becomes visible.
 *
 * There is no request schema. The only input is the refresh cookie, which
 * the browser attaches by itself and JavaScript cannot read.
 */
export const refreshResponseSchema = loginResponseSchema;

export type RefreshResponse = LoginResponse;

/* ────────────────────────────────────────────────────────────────────────
   GET /auth/me
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The signed-in user's own profile.
 *
 * Read from the database rather than reconstructed from the access token's
 * claims. A token's `roles` can be up to one access-token lifetime stale;
 * this endpoint is how a client gets the truth after something changes —
 * a driver application being approved, for instance.
 */
export const meResponseSchema = z.object({
  user: userSummarySchema,
});

export type MeResponse = z.infer<typeof meResponseSchema>;

/* ────────────────────────────────────────────────────────────────────────
   POST /auth/forgot-password  and  POST /auth/reset-password
   ──────────────────────────────────────────────────────────────────────── */

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/**
 * The reset itself.
 *
 * `passwordSchema` applies here and deliberately does not apply to login:
 * this endpoint *sets* a password, so the policy is exactly what it is for.
 * The token is bounded the same way verification tokens are — long enough
 * to be a real 43-character value, short enough that nothing absurd reaches
 * a database query.
 */
export const resetPasswordRequestSchema = z.object({
  token: z
    .string()
    .min(20, 'Reset token is malformed')
    .max(200, 'Reset token is malformed'),
  password: passwordSchema,
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
