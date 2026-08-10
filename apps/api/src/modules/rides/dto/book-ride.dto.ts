import {
  activeRideResponseSchema,
  bookRideRequestSchema,
  cancelRideRequestSchema,
  rideIdParamSchema,
  rideListQuerySchema,
  ridePageSchema,
  rideSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class BookRideRequestDto extends createZodDto(bookRideRequestSchema) {}

export class RideResponseDto extends createZodDto(rideSchema) {}

export class RideIdParamDto extends createZodDto(rideIdParamSchema) {}

export class CancelRideRequestDto extends createZodDto(
  cancelRideRequestSchema,
) {}

export class RideListQueryDto extends createZodDto(rideListQuerySchema) {}

export class RidePageResponseDto extends createZodDto(ridePageSchema) {}

export class ActiveRideResponseDto extends createZodDto(
  activeRideResponseSchema,
) {}
