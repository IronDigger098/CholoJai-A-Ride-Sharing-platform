import {
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

export class LoginResponseDto extends createZodDto(loginResponseSchema) {}

export class MeResponseDto extends createZodDto(meResponseSchema) {}
