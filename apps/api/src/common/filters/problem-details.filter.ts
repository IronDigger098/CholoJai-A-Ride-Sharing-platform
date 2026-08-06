import {
  ErrorCode,
  errorTypeUri,
  type FieldError,
  type ProblemDetails,
} from '@cholojai/shared';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { ZodError } from 'zod';

import { DomainError } from '../errors/domain-error';

/** Statuses at or above this are our fault, not the caller's. */
const SERVER_ERROR_THRESHOLD = 500;

/**
 * The one place in the application that converts a thrown value into an
 * HTTP error response.
 *
 * Every handler and service throws typed errors and never touches the
 * response object. That gives a uniform body shape across every endpoint
 * (docs/api-design.md §3), one place to add a field like `requestId`, and
 * one place to guarantee that internal details never leak to a client.
 *
 * Four kinds of thrown value are handled:
 *   1. `DomainError`   — our own errors, mapped directly.
 *   2. `ZodError`      — schema validation, mapped to field errors.
 *   3. `HttpException` — raised by Nest itself (404 for unknown routes,
 *                        payload-too-large, and so on).
 *   4. anything else   — a bug. 500, logged with its stack, and
 *                        deliberately opaque to the caller.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  public constructor(private readonly isProduction: boolean) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { id?: string }>();
    const response = context.getResponse<Response>();

    const problem = this.toProblemDetails(exception, request);

    this.log(exception, problem);

    response
      .status(problem.status)
      // RFC 9457 mandates this content type. It tells a generic client
      // "this body is a structured error", not just some JSON.
      .type('application/problem+json')
      .json(problem);
  }

  private toProblemDetails(
    exception: unknown,
    request: Request & { id?: string },
  ): ProblemDetails {
    const base = {
      instance: request.originalUrl,
      ...(typeof request.id === 'string' ? { requestId: request.id } : {}),
    };

    if (exception instanceof DomainError) {
      return {
        type: errorTypeUri(exception.code),
        title: exception.title,
        status: exception.status,
        code: exception.code,
        detail: exception.message,
        ...(exception.fieldErrors === undefined
          ? {}
          : { errors: exception.fieldErrors }),
        ...base,
      };
    }

    if (exception instanceof ZodError) {
      return {
        type: errorTypeUri(ErrorCode.VALIDATION_FAILED),
        title: 'Validation failed',
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_FAILED,
        detail: 'One or more fields are invalid.',
        errors: toFieldErrors(exception),
        ...base,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: errorTypeUri(codeForStatus(status)),
        title: titleForStatus(status),
        status,
        code: codeForStatus(status),
        detail: extractHttpExceptionDetail(exception),
        ...base,
      };
    }

    /* An unrecognised throw is a bug in our code. In production the client
       is told nothing beyond "something broke" — an exception message can
       contain a SQL fragment, a file path, or a connection string, and an
       attacker probing endpoints reads error text for exactly that. The
       requestId is what connects the user's report to the full stack trace
       sitting safely in our logs. */
    return {
      type: errorTypeUri(ErrorCode.INTERNAL_ERROR),
      title: 'Internal server error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      detail: this.isProduction
        ? 'An unexpected error occurred. Quote the request id when reporting this.'
        : describeUnknown(exception),
      ...base,
    };
  }

  /**
   * Log at a severity that matches who is at fault.
   *
   * 5xx is our bug: log the stack at `error`, because someone must act.
   * 4xx is the caller's mistake and is expected traffic — a failed login
   * or a 404 is not an incident, and logging stacks for them turns the
   * error log into noise nobody reads.
   */
  private log(exception: unknown, problem: ProblemDetails): void {
    const summary = `${problem.status} ${problem.code} ${problem.instance ?? ''}`;

    if (problem.status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        summary,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    this.logger.warn(summary);
  }
}

/** Flatten a ZodError into the field-level array clients render inline. */
function toFieldErrors(error: ZodError): readonly FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/**
 * Nest's `HttpException` carries either a string or an object response.
 * Pull out something human-readable without trusting its shape.
 */
function extractHttpExceptionDetail(exception: HttpException): string {
  const payload: unknown = exception.getResponse();

  if (typeof payload === 'string') return payload;

  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join('; ');
  }

  return exception.message;
}

/** Describe a non-Error throw for development output. */
function describeUnknown(exception: unknown): string {
  if (exception instanceof Error) return exception.message;
  return `Non-Error thrown: ${String(exception)}`;
}

const STATUS_CODES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.MALFORMED_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

const STATUS_TITLES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad request',
  [HttpStatus.UNAUTHORIZED]: 'Authentication required',
  [HttpStatus.FORBIDDEN]: 'Insufficient permission',
  [HttpStatus.NOT_FOUND]: 'Not found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable request',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests',
};

function codeForStatus(status: number): string {
  return STATUS_CODES[status] ?? ErrorCode.INTERNAL_ERROR;
}

function titleForStatus(status: number): string {
  return STATUS_TITLES[status] ?? 'Request failed';
}
