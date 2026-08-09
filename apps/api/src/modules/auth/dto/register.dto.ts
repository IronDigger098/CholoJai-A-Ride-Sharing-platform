import {
  registerRequestSchema,
  registerResponseSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * DTO classes derived from the shared Zod schemas.
 *
 * These add nothing of their own — they exist because `@nestjs/swagger`
 * reads runtime decorator metadata from a class, and an interface is erased
 * at compile time. `createZodDto` bridges the two: the class carries the
 * schema for validation *and* generates the OpenAPI shape.
 *
 * The upshot is that the request rules, the runtime validation, and the
 * published documentation all trace back to one definition in
 * `packages/shared`. Change the password minimum there and the form, the
 * API, and the docs all move together.
 */

export class RegisterRequestDto extends createZodDto(registerRequestSchema) {}

export class RegisterResponseDto extends createZodDto(registerResponseSchema) {}
