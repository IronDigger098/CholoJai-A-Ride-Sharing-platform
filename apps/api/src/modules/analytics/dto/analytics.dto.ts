import {
  platformMetricsQuerySchema,
  platformMetricsSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class PlatformMetricsQueryDto extends createZodDto(
  platformMetricsQuerySchema,
) {}

export class PlatformMetricsDto extends createZodDto(platformMetricsSchema) {}
