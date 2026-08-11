import {
  couponIdParamSchema,
  couponListSchema,
  couponSchema,
  createCouponRequestSchema,
  updateCouponRequestSchema,
} from '@cholojai/shared';
import { createZodDto } from 'nestjs-zod';

/**
 * The admin campaign surface, typed from the shared contracts.
 *
 * `startsAt` and `endsAt` cross the wire as ISO strings and become `Date`s
 * in the service. The boundary is the only place that conversion happens —
 * a controller handing a raw string to a repository would compile, and
 * compare a string to a `Date` at midnight one day.
 */
export class CreateCouponRequestDto extends createZodDto(
  createCouponRequestSchema,
) {}

export class UpdateCouponRequestDto extends createZodDto(
  updateCouponRequestSchema,
) {}

export class CouponIdParamDto extends createZodDto(couponIdParamSchema) {}

export class CouponDto extends createZodDto(couponSchema) {}

export class CouponListDto extends createZodDto(couponListSchema) {}
