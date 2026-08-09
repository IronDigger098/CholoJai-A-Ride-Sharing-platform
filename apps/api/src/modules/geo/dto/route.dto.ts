import { routeRequestSchema, routeResponseSchema } from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class RouteRequestDto extends createZodDto(routeRequestSchema) {}

export class RouteResponseDto extends createZodDto(routeResponseSchema) {}
