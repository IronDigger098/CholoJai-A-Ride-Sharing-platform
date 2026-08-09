import { bookRideRequestSchema, rideSchema } from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class BookRideRequestDto extends createZodDto(bookRideRequestSchema) {}

export class RideResponseDto extends createZodDto(rideSchema) {}
