import {
  reverseGeocodeQuerySchema,
  reverseGeocodeResponseSchema,
  routeRequestSchema,
  routeResponseSchema,
  searchPlacesQuerySchema,
  searchPlacesResponseSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class RouteRequestDto extends createZodDto(routeRequestSchema) {}

export class RouteResponseDto extends createZodDto(routeResponseSchema) {}

export class SearchPlacesQueryDto extends createZodDto(
  searchPlacesQuerySchema,
) {}

export class SearchPlacesResponseDto extends createZodDto(
  searchPlacesResponseSchema,
) {}

export class ReverseGeocodeQueryDto extends createZodDto(
  reverseGeocodeQuerySchema,
) {}

export class ReverseGeocodeResponseDto extends createZodDto(
  reverseGeocodeResponseSchema,
) {}
