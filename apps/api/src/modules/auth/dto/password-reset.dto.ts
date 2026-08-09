import {
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class ForgotPasswordRequestDto extends createZodDto(
  forgotPasswordRequestSchema,
) {}

export class ResetPasswordRequestDto extends createZodDto(
  resetPasswordRequestSchema,
) {}
