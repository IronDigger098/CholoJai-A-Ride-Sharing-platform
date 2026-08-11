import {
  activeRideResponseSchema,
  bookRideRequestSchema,
  cancelRideRequestSchema,
  paymentSchema,
  rideIdParamSchema,
  rideListQuerySchema,
  rideOffersSchema,
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

export class RideOffersDto extends createZodDto(rideOffersSchema) {}

export class PaymentResponseDto extends createZodDto(paymentSchema) {}
