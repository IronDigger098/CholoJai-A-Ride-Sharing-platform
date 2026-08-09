import {
  fareQuoteRequestSchema,
  fareQuoteResponseSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class FareQuoteRequestDto extends createZodDto(fareQuoteRequestSchema) {}

export class FareQuoteResponseDto extends createZodDto(
  fareQuoteResponseSchema,
) {}
