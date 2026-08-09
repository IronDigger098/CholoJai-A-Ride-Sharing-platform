import {
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

export class LoginResponseDto extends createZodDto(loginResponseSchema) {}

/**
 * Structurally identical to {@link LoginResponseDto}, and a separate class
 * on purpose: Swagger names schemas after the class, so reusing
 * `LoginResponseDto` on `/auth/refresh` would document the two endpoints as
 * returning the same named type and hide that they can diverge later.
 */
export class RefreshResponseDto extends createZodDto(refreshResponseSchema) {}

export class MeResponseDto extends createZodDto(meResponseSchema) {}
