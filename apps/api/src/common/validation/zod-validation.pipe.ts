import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';

import { ValidationFailedError } from '../errors/domain-error';

/**
 * Validates every request body, query, and param against its Zod schema.
 *
 * The schema comes from `packages/shared`, so the rule enforced here is the
 * same object the browser form validates against (ADR-005). One definition,
 * two enforcement points, no drift.
 *
 * `nestjs-zod` would otherwise throw its own `ZodValidationException`, which
 * our exception filter would treat as a generic `HttpException` and flatten
 * into a message with no field detail. Converting to `ValidationFailedError`
 * keeps every failure inside our own error hierarchy, so a client always
 * receives the same RFC 9457 body with a populated `errors` array it can
 * render inline against each input.
 *
 * The callback takes `unknown` rather than `ZodError` because that is the
 * signature nestjs-zod declares. Narrowing the parameter would be unsound —
 * the library is free to hand us anything — and `strictFunctionTypes`
 * rejects it for exactly that reason. Better to accept the honest type and
 * narrow.
 */
export const ZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: unknown): Error => {
    if (error instanceof ZodError) {
      return new ValidationFailedError(
        error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );
    }

    /* Not a ZodError. Still a 400 — the request failed validation — but
       with no field detail to offer, and deliberately no echo of whatever
       was thrown, which could carry internals. */
    return new ValidationFailedError([
      { path: '', message: 'The request could not be validated.' },
    ]);
  },
});
