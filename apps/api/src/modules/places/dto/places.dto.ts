import {
  createSavedPlaceRequestSchema,
  savedPlaceIdParamSchema,
  savedPlaceListSchema,
  savedPlaceSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

/** Saved places, typed from the shared contracts. */
export class CreateSavedPlaceRequestDto extends createZodDto(
  createSavedPlaceRequestSchema,
) {}

export class SavedPlaceIdParamDto extends createZodDto(
  savedPlaceIdParamSchema,
) {}

export class SavedPlaceDto extends createZodDto(savedPlaceSchema) {}

export class SavedPlaceListDto extends createZodDto(savedPlaceListSchema) {}
