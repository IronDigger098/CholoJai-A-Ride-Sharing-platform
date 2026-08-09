import {
  bookRideRequestSchema,
  cancelRideRequestSchema,
  rideIdParamSchema,
  rideSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class BookRideRequestDto extends createZodDto(bookRideRequestSchema) {}

export class RideResponseDto extends createZodDto(rideSchema) {}

export class RideIdParamDto extends createZodDto(rideIdParamSchema) {}

export class CancelRideRequestDto extends createZodDto(
  cancelRideRequestSchema,
) {}
