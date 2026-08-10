import {
  createVehicleRequestSchema,
  vehicleIdParamSchema,
  vehicleListSchema,
  vehicleSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateVehicleRequestDto extends createZodDto(
  createVehicleRequestSchema,
) {}

export class VehicleDto extends createZodDto(vehicleSchema) {}

export class VehicleListDto extends createZodDto(vehicleListSchema) {}

export class VehicleIdParamDto extends createZodDto(vehicleIdParamSchema) {}
