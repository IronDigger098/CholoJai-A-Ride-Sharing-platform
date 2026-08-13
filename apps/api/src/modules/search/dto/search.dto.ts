import { searchQuerySchema, searchResponseSchema } from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * Search, typed from the shared contracts.
 *
 * `limit` arrives as a string — `?limit=5` is one character, not a number —
 * so the schema coerces. Same reason the contact list query does.
 */
export class SearchQueryDto extends createZodDto(searchQuerySchema) {}

export class SearchResponseDto extends createZodDto(searchResponseSchema) {}
