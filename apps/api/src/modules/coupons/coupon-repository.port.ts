import { type CouponKind } from '@cholojai/shared';

/** What the coupons feature needs from persistence. */

export interface CouponRecord {
  readonly id: string;
  readonly code: string;
  readonly kind: CouponKind;
  readonly value: number;
  readonly maxDiscountPaisa: number | null;
  readonly minFarePaisa: number;
  readonly maxRedemptions: number | null;
  readonly perUserLimit: number;
  readonly redeemedCount: number;
  readonly firstRideOnly: boolean;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export interface CreateCouponInput {
  readonly code: string;
  readonly kind: CouponKind;
  readonly value: number;
  readonly maxDiscountPaisa?: number | undefined;
  readonly minFarePaisa: number;
  readonly maxRedemptions?: number | undefined;
  readonly perUserLimit: number;
  readonly firstRideOnly: boolean;
  readonly startsAt: Date;
  readonly endsAt?: Date | undefined;
}

export interface UpdateCouponInput {
  readonly maxRedemptions?: number | null | undefined;
  readonly perUserLimit?: number | undefined;
  readonly endsAt?: Date | null | undefined;
  readonly isActive?: boolean | undefined;
}

export interface RedeemCouponInput {
  readonly couponId: string;
  readonly userId: string;
  readonly rideId: string;
  readonly amountPaisa: number;
}

export interface CouponRepository {
  create(input: CreateCouponInput): Promise<CouponRecord>;

  /** Null when the id is unknown. */
  update(
    couponId: string,
    input: UpdateCouponInput,
  ): Promise<CouponRecord | null>;

  /** By code, already uppercased by the contract. */
  findByCode(code: string): Promise<CouponRecord | null>;

  list(): Promise<readonly CouponRecord[]>;

  /** How many times this rider has already redeemed this campaign. */
  countRedemptionsBy(couponId: string, userId: string): Promise<number>;

  /**
   * Has this rider ever finished a ride?
   *
   * A read of the rides table from the coupons adapter, and a deliberate
   * one. The alternative is for this module to depend on `RidesModule`,
   * which depends on `FaresModule`, which is about to depend on this — a
   * cycle introduced to answer a single boolean. Persistence is allowed to
   * know that rides exist; the *service* still does not.
   */
  hasCompletedRide(userId: string): Promise<boolean>;

  /**
   * Record a redemption and consume one from the budget, atomically.
   *
   * Returns false when the budget was exhausted between evaluation and this
   * call. The increment carries `max_redemptions` in its WHERE clause, so
   * two riders spending the last redemption at the same moment produce one
   * write and one refusal — the check cannot be a read, because a read is a
   * guess about a number someone else is also changing.
   */
  redeem(input: RedeemCouponInput): Promise<boolean>;
}

export const COUPON_REPOSITORY = Symbol('COUPON_REPOSITORY');
