import {
  createReviewRequestSchema,
  myReviewResponseSchema,
  reviewSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateReviewRequestDto extends createZodDto(
  createReviewRequestSchema,
) {}

export class ReviewDto extends createZodDto(reviewSchema) {}

export class MyReviewResponseDto extends createZodDto(myReviewResponseSchema) {}
