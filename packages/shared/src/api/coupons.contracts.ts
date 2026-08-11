import { z } from 'zod';

/**
 * Discount campaigns — `docs/roadmap.md` M9b.
 *
 * A coupon is evaluated when the quote is priced, never at booking. The
 * discount lands inside the quote's breakdown, so the number the rider
 * accepted is the number that becomes the ride's fare snapshot and the one
 * the `fare_total_is_consistent` CHECK constraint verifies (D2).
 *
 * Evaluating at booking would mean the price shown and the price charged
 * are computed at different moments, from a campaign that may have been
 * retired or exhausted in between — which is exactly the divergence the
 * snapshot rule exists to prevent.
 */

export const CouponKind = {
  /** `value` is a percentage, 1–100. */
  PERCENT: 'PERCENT',
  /** `value` is paisa off. */
  FIXED: 'FIXED',
} as const;

export type CouponKind = (typeof CouponKind)[keyof typeof CouponKind];

/**
 * Codes are case-insensitive and stored uppercase.
 *
 * Normalised in the schema rather than at each call site, for the same
 * reason plate numbers are: a rider typing `welcome10` and an administrator
 * creating `WELCOME10` mean the same campaign, and the database should not
 * be the only place that finds out they disagreed.
 */
export const couponCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/u, 'Letters, numbers and dashes only')
  .transform((value) => value.toUpperCase());

/** A campaign, as an administrator manages it. */
export const couponSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.nativeEnum(CouponKind),
  value: z.number().int().positive(),
  maxDiscountPaisa: z.number().int().nonnegative().nullable(),
  minFarePaisa: z.number().int().nonnegative(),
  maxRedemptions: z.number().int().positive().nullable(),
  perUserLimit: z.number().int().positive(),
  redeemedCount: z.number().int().nonnegative(),
  firstRideOnly: z.boolean(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});

export type Coupon = z.infer<typeof couponSchema>;

/**
 * Creating a campaign.
 *
 * `redeemedCount` is absent, deliberately: it is a fact the platform
 * accumulates, not a field anyone sets. Letting an administrator write it
 * would let them un-spend a budget.
 */
export const createCouponRequestSchema = z
  .object({
    code: couponCodeSchema,
    kind: z.nativeEnum(CouponKind),
    value: z.number().int().positive(),
    maxDiscountPaisa: z.number().int().positive().optional(),
    minFarePaisa: z.number().int().nonnegative().default(0),
    maxRedemptions: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().default(1),
    firstRideOnly: z.boolean().default(false),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional(),
  })
  /* A percentage over 100 would price a ride below nothing. Checked here
     rather than only in the service, because it is a property of the shape
     and the admin form should be told before it submits. */
  .refine((input) => input.kind !== CouponKind.PERCENT || input.value <= 100, {
    message: 'A percentage discount cannot exceed 100',
    path: ['value'],
  })
  .refine(
    (input) =>
      input.endsAt === undefined ||
      Date.parse(input.endsAt) > Date.parse(input.startsAt),
    { message: 'The end must come after the start', path: ['endsAt'] },
  );

export type CreateCouponRequest = z.infer<typeof createCouponRequestSchema>;

/** Everything an administrator may change after a campaign is running. */
export const updateCouponRequestSchema = z.object({
  maxRedemptions: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateCouponRequest = z.infer<typeof updateCouponRequestSchema>;

export const couponIdParamSchema = z.object({
  couponId: z.string().min(1).max(64),
});

export type CouponIdParam = z.infer<typeof couponIdParamSchema>;

export const couponListSchema = z.object({
  coupons: z.array(couponSchema),
});

export type CouponList = z.infer<typeof couponListSchema>;

/**
 * What the rider is told about the coupon on their quote.
 *
 * The applied amount is per-quote, not per-option: the picker shows several
 * vehicle types at different prices, and a percentage takes a different
 * number off each. This reports the campaign that applied and lets the
 * per-option breakdowns carry the actual figures.
 */
export const appliedCouponSchema = z.object({
  code: z.string(),
  kind: z.nativeEnum(CouponKind),
  value: z.number().int().positive(),
});

export type AppliedCoupon = z.infer<typeof appliedCouponSchema>;
