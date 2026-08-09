import {
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class VerifyEmailRequestDto extends createZodDto(
  verifyEmailRequestSchema,
) {}

export class VerifyEmailResponseDto extends createZodDto(
  verifyEmailResponseSchema,
) {}

export class ResendVerificationRequestDto extends createZodDto(
  resendVerificationRequestSchema,
) {}
