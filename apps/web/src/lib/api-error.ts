import {
  ErrorCode,
  errorTypeUri,
  type FieldError,
  isProblemDetails,
  type ProblemDetails,
} from '@cholojai/shared';
import axios from 'axios';

/**
 * Every failure from the API, in one shape.
 *
 * The API answers RFC 9457 `ProblemDetails` for every error it raises
 * (api-design.md §3), so the client should never have to ask whether a
 * failure has a `code`, a `status`, or field errors — it always does, and
 * the two cases that genuinely have no server response are converted into
 * the same shape here rather than left for each caller to handle.
 *
 * `code` is the only field a caller may branch on. `title` and `detail` are
 * human-facing and will be translated the day Bangla ships; matching on them
 * builds a bug with a delayed fuse.
 */
export class ApiError extends Error {
  public constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    // Without this, `instanceof ApiError` fails for anything downcompiled.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  public get code(): string {
    return this.problem.code;
  }

  public get status(): number {
    return this.problem.status;
  }

  /** Field-level failures, empty unless this was a validation error. */
  public get fieldErrors(): readonly FieldError[] {
    return this.problem.errors ?? [];
  }

  /**
   * The message for one form field, if the server rejected it.
   *
   * Exists so a form can render server-side validation inline against the
   * input that caused it, which is the only reason `errors` carries a path
   * at all.
   */
  public messageFor(path: string): string | undefined {
    return this.fieldErrors.find((error) => error.path === path)?.message;
  }
}

/**
 * A failure that never reached the API.
 *
 * Given the same shape as a real problem rather than a bare `Error`, so a
 * caller writes one error path instead of two. `status: 0` is the
 * convention for "no HTTP response happened" — a real status would claim
 * the server said something it did not.
 */
const NETWORK_PROBLEM: ProblemDetails = {
  type: errorTypeUri('NETWORK_ERROR'),
  title: 'Cannot reach CholoJai',
  status: 0,
  code: 'NETWORK_ERROR',
  detail: 'We could not reach the server. Check your connection and try again.',
};

const UNEXPECTED_PROBLEM: ProblemDetails = {
  type: errorTypeUri(ErrorCode.INTERNAL_ERROR),
  title: 'Something went wrong',
  status: 500,
  code: ErrorCode.INTERNAL_ERROR,
  detail: 'Something went wrong at our end. Please try again.',
};

/**
 * Normalise anything thrown by the client into an `ApiError`.
 *
 * Three cases, and the middle one is the reason this exists. A response
 * whose body is not `ProblemDetails` — an HTML error page from a proxy, a
 * gateway timeout, a truncated payload — must not be read as if it were
 * one, because `body.code` on an HTML string is `undefined` and every
 * downstream branch silently takes its `else`.
 */
export function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;

  if (axios.isAxiosError(cause)) {
    const body: unknown = cause.response?.data;

    if (isProblemDetails(body)) return new ApiError(body);

    /* A request that never got a response: offline, DNS failure, CORS
       rejection, or a timeout. Distinguished from a malformed response
       because the advice differs — retry versus report. */
    if (cause.response === undefined) return new ApiError(NETWORK_PROBLEM);

    return new ApiError({
      ...UNEXPECTED_PROBLEM,
      status: cause.response.status,
    });
  }

  return new ApiError(UNEXPECTED_PROBLEM);
}
