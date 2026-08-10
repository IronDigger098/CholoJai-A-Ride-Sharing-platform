import {
  driverApplicationListQuerySchema,
  driverApplicationListSchema,
  driverApplicationRequestSchema,
  driverProfileIdParamSchema,
  driverProfileSchema,
  myDriverProfileSchema,
  rejectDriverApplicationSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class DriverApplicationRequestDto extends createZodDto(
  driverApplicationRequestSchema,
) {}

export class DriverProfileDto extends createZodDto(driverProfileSchema) {}

/** `null` until the caller has applied, so the shape is wrapped. */
export class MyDriverProfileDto extends createZodDto(myDriverProfileSchema) {}

export class DriverApplicationListQueryDto extends createZodDto(
  driverApplicationListQuerySchema,
) {}

export class DriverApplicationListDto extends createZodDto(
  driverApplicationListSchema,
) {}

export class DriverProfileIdParamDto extends createZodDto(
  driverProfileIdParamSchema,
) {}

export class RejectDriverApplicationDto extends createZodDto(
  rejectDriverApplicationSchema,
) {}
