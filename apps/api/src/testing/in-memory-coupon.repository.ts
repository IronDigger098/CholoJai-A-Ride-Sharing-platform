import {
  type CouponRecord,
  type CouponRepository,
  type CreateCouponInput,
  type RedeemCouponInput,
  type UpdateCouponInput,
} from '../modules/coupons/coupon-repository.port';
import { CouponCodeTakenError } from '../modules/coupons/coupons.errors';

/**
 * In-memory {@link CouponRepository}.
 *
 * `redeem` reproduces the one behaviour that matters: the budget check and
 * the increment are one step, and it refuses once the budget is gone. It
 * cannot reproduce the *reason* the real one is safe — a conditional UPDATE
 * under concurrency — which is why the adapter has its own integration test.
 */
export class InMemoryCouponRepository implements CouponRepository {
  public readonly rows: CouponRecord[] = [];
  public readonly redemptions: RedeemCouponInput[] = [];

  /** Riders the tests declare to have finished a ride already. */
  public readonly ridden = new Set<string>();

  private sequence = 0;

  public constructor(seed: CouponRecord[] = []) {
    this.rows.push(...seed);
  }

  public async create(input: CreateCouponInput): Promise<CouponRecord> {
    if (this.rows.some((row) => row.code === input.code)) {
      throw new CouponCodeTakenError(input.code);
    }

    const record: CouponRecord = {
      id: `coupon_${++this.sequence}`,
      code: input.code,
      kind: input.kind,
      value: input.value,
      maxDiscountPaisa: input.maxDiscountPaisa ?? null,
      minFarePaisa: input.minFarePaisa,
      maxRedemptions: input.maxRedemptions ?? null,
      perUserLimit: input.perUserLimit,
      redeemedCount: 0,
      firstRideOnly: input.firstRideOnly,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      isActive: true,
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    };

    this.rows.push(record);
    return record;
  }

  public async update(
    couponId: string,
    input: UpdateCouponInput,
  ): Promise<CouponRecord | null> {
    const index = this.rows.findIndex((row) => row.id === couponId);
    const existing = this.rows[index];

    if (existing === undefined) return null;

    const updated: CouponRecord = {
      ...existing,
      ...(input.maxRedemptions === undefined
        ? {}
        : { maxRedemptions: input.maxRedemptions }),
      ...(input.perUserLimit === undefined
        ? {}
        : { perUserLimit: input.perUserLimit }),
      ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    };

    this.rows[index] = updated;
    return updated;
  }

  public async findByCode(code: string): Promise<CouponRecord | null> {
    return this.rows.find((row) => row.code === code) ?? null;
  }

  public async list(): Promise<readonly CouponRecord[]> {
    return [...this.rows];
  }

  public async countRedemptionsBy(
    couponId: string,
    userId: string,
  ): Promise<number> {
    return this.redemptions.filter(
      (row) => row.couponId === couponId && row.userId === userId,
    ).length;
  }

  public async hasCompletedRide(userId: string): Promise<boolean> {
    return this.ridden.has(userId);
  }

  public async redeem(input: RedeemCouponInput): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.id === input.couponId);
    const coupon = this.rows[index];

    /* Missing and retired are the same answer here: nothing to spend. */
    if (coupon?.isActive !== true) return false;

    if (
      coupon.maxRedemptions !== null &&
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      return false;
    }

    /* One redemption per ride, like the unique index. */
    if (this.redemptions.some((row) => row.rideId === input.rideId)) {
      return false;
    }

    this.rows[index] = {
      ...coupon,
      redeemedCount: coupon.redeemedCount + 1,
    };
    this.redemptions.push(input);

    return true;
  }
}
