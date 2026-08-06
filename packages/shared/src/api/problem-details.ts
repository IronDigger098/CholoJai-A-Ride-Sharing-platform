/**
 * The single error shape for every CholoJai API response — RFC 9457
 * "Problem Details for HTTP APIs" (docs/api-design.md §3).
 *
 * This lives in the shared package so the web app compiles against exactly
 * the contract the API produces. If the API changes an error's shape and
 * the frontend is not updated, that becomes a type error at build time
 * rather than a blank screen in production.
 */

/** A single field-level validation failure. */
export interface FieldError {
  /** Dot/bracket path to the offending field, e.g. `pickup.lat`. */
  readonly path: string;
  /** Human-readable, translatable explanation. Never switch on this. */
  readonly message: string;
}

export interface ProblemDetails {
  /** URI identifying the error type. Stable, dereferenceable documentation. */
  readonly type: string;
  /** Short human-readable summary. Translatable — never switch on this. */
  readonly title: string;
  /** HTTP status code, duplicated in the body for clients that lose it. */
  readonly status: number;
  /**
   * The machine-readable contract.
   *
   * This is the ONLY field a client may branch on. `title` and `detail` are
   * human-facing and will be translated; matching on them would break the
   * moment we ship Bangla.
   */
  readonly code: string;
  /** Human-readable explanation of this specific occurrence. */
  readonly detail?: string;
  /** The path that produced the error. */
  readonly instance?: string;
  /** Correlation id — quote this in a bug report to find the exact logs. */
  readonly requestId?: string;
  /** Present only for validation failures. */
  readonly errors?: readonly FieldError[];
}

/**
 * Error codes shared by the whole platform.
 *
 * Feature modules add their own codes alongside these; what matters is that
 * a code is a stable string the frontend can rely on forever. Renaming one
 * is a breaking API change.
 */
export const ErrorCode = {
  // 400 / 422 — the request itself is wrong
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  UNPROCESSABLE: 'UNPROCESSABLE',

  // 401 / 403 — identity and permission
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',

  // 404 / 409 — resource state
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // 429 / 500
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Base URI for the `type` field. */
export const ERROR_TYPE_BASE_URI = 'https://cholojai.app/errors';

/**
 * Build the `type` URI from a code: `RIDE_NOT_FOUND` →
 * `https://cholojai.app/errors/ride-not-found`.
 *
 * Deriving it rather than storing it means the two can never disagree.
 */
export function errorTypeUri(code: string): string {
  const slug = code.toLowerCase().replace(/_/gu, '-');
  return `${ERROR_TYPE_BASE_URI}/${slug}`;
}

/** Type guard for use in the web app's API client. */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['type'] === 'string' &&
    typeof candidate['title'] === 'string' &&
    typeof candidate['status'] === 'number' &&
    typeof candidate['code'] === 'string'
  );
}
