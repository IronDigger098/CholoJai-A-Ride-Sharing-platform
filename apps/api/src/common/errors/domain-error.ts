import { ErrorCode, type FieldError } from '@cholojai/shared';

/**
 * Base class for every error the domain raises.
 *
 * Services throw these. They carry no HTTP objects, no response, no
 * framework types — a service can be unit tested without mocking a request,
 * and the same error could later be surfaced over a WebSocket or a queue
 * without change. Exactly one place (the problem-details filter) knows how
 * to turn a `DomainError` into an HTTP response.
 *
 * The semantic subclasses below (`NotFoundError`, `ConflictError`, …) fix
 * the HTTP status. Feature modules extend those with a specific `code`:
 *
 * ```ts
 * export class RideNotFoundError extends NotFoundError {
 *   public readonly code = 'RIDE_NOT_FOUND';
 *   public constructor(rideId: string) {
 *     super(`No ride exists with id ${rideId}`);
 *   }
 * }
 * ```
 */
export abstract class DomainError extends Error {
  /** HTTP status this error maps to. Fixed by the semantic subclass. */
  public abstract readonly status: number;

  /** Stable, machine-readable identifier. The client's only contract. */
  public abstract readonly code: string;

  /** Short human-readable summary. Translatable. */
  public abstract readonly title: string;

  /** Field-level failures, present only on validation errors. */
  public readonly fieldErrors?: readonly FieldError[];

  public constructor(
    detail: string,
    options?: { cause?: unknown; fieldErrors?: readonly FieldError[] },
  ) {
    super(detail);
    this.name = new.target.name;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    if (options?.fieldErrors !== undefined) {
      this.fieldErrors = options.fieldErrors;
    }
    // Without this, `instanceof` fails for subclasses when targeting ES5;
    // harmless on modern targets and cheap insurance against a tsconfig
    // change silently breaking every error check in the codebase.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 — the request is syntactically or semantically invalid. */
export abstract class BadRequestError extends DomainError {
  public readonly status = 400;
}

/** 401 — no valid credentials were presented. *Who are you?* */
export abstract class UnauthenticatedError extends DomainError {
  public readonly status = 401;
}

/**
 * 403 — credentials are valid but insufficient.
 * *I know who you are, and you may not do this.*
 */
export abstract class ForbiddenError extends DomainError {
  public readonly status = 403;
}

/** 404 — the resource does not exist, or the caller may not know it does. */
export abstract class NotFoundError extends DomainError {
  public readonly status = 404;
}

/**
 * 409 — the request conflicts with current state.
 *
 * The natural home for state-machine violations: accepting a ride that
 * another driver already took (domain-model §3).
 */
export abstract class ConflictError extends DomainError {
  public readonly status = 409;
}

/**
 * 422 — well-formed but not actionable.
 *
 * Distinct from 400: the syntax is fine and the values are individually
 * valid, but the request cannot be fulfilled — an expired fare quote, for
 * example.
 */
export abstract class UnprocessableError extends DomainError {
  public readonly status = 422;
}

/* ────────────────────────────────────────────────────────────────────────
   Concrete platform-level errors. Feature modules define their own.
   ──────────────────────────────────────────────────────────────────────── */

/** Request body or query failed schema validation. */
export class ValidationFailedError extends BadRequestError {
  public readonly code = ErrorCode.VALIDATION_FAILED;
  public readonly title = 'Validation failed';

  public constructor(fieldErrors: readonly FieldError[]) {
    super('One or more fields are invalid.', { fieldErrors });
  }
}

/** No credentials, or credentials that do not authenticate. */
export class AuthenticationRequiredError extends UnauthenticatedError {
  public readonly code = ErrorCode.UNAUTHENTICATED;
  public readonly title = 'Authentication required';

  public constructor(detail = 'You must be signed in to do this.') {
    super(detail);
  }
}

/** Authenticated, but lacking the required role or ownership. */
export class InsufficientPermissionError extends ForbiddenError {
  public readonly code = ErrorCode.FORBIDDEN;
  public readonly title = 'Insufficient permission';

  public constructor(detail = 'You do not have permission to do this.') {
    super(detail);
  }
}

/**
 * A named resource could not be found.
 *
 * Takes the resource name so the message is specific without every module
 * writing its own subclass for the trivial case.
 */
export class ResourceNotFoundError extends NotFoundError {
  public readonly code = ErrorCode.NOT_FOUND;
  public readonly title = 'Not found';

  public constructor(resource: string, id?: string) {
    super(
      id === undefined
        ? `No ${resource} was found.`
        : `No ${resource} exists with id ${id}.`,
    );
  }
}
