import {
  type Coupon,
  CouponKind,
  type CreateCouponRequest,
  type UpdateCouponRequest,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  COUPON_REPOSITORY,
  type CouponRecord,
  type CouponRepository,
} from './coupon-repository.port';
import {
  CouponAlreadyUsedError,
  CouponExhaustedError,
  CouponForFirstRideOnlyError,
  CouponNotFoundError,
  CouponNotRunningError,
  FareBelowCouponMinimumError,
} from './coupons.errors';

/** What applying a coupon to one priced option produced. */
export interface CouponEvaluation {
  readonly couponId: string;
  readonly code: string;
  readonly kind: CouponKind;
  readonly value: number;
  /** Given a subtotal, what comes off it. */
  readonly discountFor: (subtotalPaisa: number) => number;
}

/**
 * Campaigns, and whether one applies.
 *
 * `evaluate` answers "may this rider use this code, and for how much" and
 * changes nothing. `redeem` spends it. They are separate because they happen
 * at different moments — evaluation prices a quote, redemption happens when
 * that quote becomes a ride, possibly minutes later and possibly never.
 */
@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  public constructor(
    @Inject(COUPON_REPOSITORY) private readonly coupons: CouponRepository,
  ) {}

  /**
   * Check every limit, then hand back a function that prices any subtotal.
   *
   * A function rather than a number, because one quote carries several
   * vehicle types at different fares and a percentage takes a different
   * amount off each. Evaluating once and applying many times also means the
   * six checks run once per quote rather than once per option.
   *
   * The lowest fare in the quote decides the minimum-fare check, so a rider
   * is never shown a discount on the CNG that vanishes when they pick the
   * bike.
   */
  public async evaluate(
    code: string,
    riderId: string,
    lowestSubtotalPaisa: number,
  ): Promise<CouponEvaluation> {
    const coupon = await this.coupons.findByCode(code);

    if (coupon === null) throw new CouponNotFoundError();

    this.assertRunning(coupon);

    if (lowestSubtotalPaisa < coupon.minFarePaisa) {
      throw new FareBelowCouponMinimumError();
    }

    /* Budget first, then the per-rider limit: the cheaper check refuses more
       people, and a rider who cannot use it at all should not be told about
       their own history. */
    if (
      coupon.maxRedemptions !== null &&
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      throw new CouponExhaustedError();
    }

    const used = await this.coupons.countRedemptionsBy(coupon.id, riderId);

    if (used >= coupon.perUserLimit) {
      throw new CouponAlreadyUsedError(coupon.perUserLimit);
    }

    if (
      coupon.firstRideOnly &&
      (await this.coupons.hasCompletedRide(riderId))
    ) {
      throw new CouponForFirstRideOnlyError();
    }

    return {
      couponId: coupon.id,
      code: coupon.code,
      kind: coupon.kind,
      value: coupon.value,
      discountFor: (subtotal) => discountFor(coupon, subtotal),
    };
  }

  /**
   * Spend it. False when someone else took the last one first.
   *
   * Never throws on exhaustion. By the time this runs the ride is being
   * created, and failing the booking because a discount could not be
   * recorded would cost the rider their ride to protect a marketing budget.
   * The caller books at the quoted price and the campaign goes one over,
   * which is the cheaper of the two mistakes.
   */
  public async redeem(input: {
    readonly couponId: string;
    readonly userId: string;
    readonly rideId: string;
    readonly amountPaisa: number;
  }): Promise<boolean> {
    const spent = await this.coupons.redeem(input);

    if (!spent) {
      this.logger.warn(
        `Coupon ${input.couponId} was exhausted before ride ${input.rideId} could redeem it`,
      );
    }

    return spent;
  }

  public async create(request: CreateCouponRequest): Promise<Coupon> {
    const record = await this.coupons.create({
      code: request.code,
      kind: request.kind,
      value: request.value,
      minFarePaisa: request.minFarePaisa,
      perUserLimit: request.perUserLimit,
      firstRideOnly: request.firstRideOnly,
      startsAt: new Date(request.startsAt),
      ...(request.maxDiscountPaisa === undefined
        ? {}
        : { maxDiscountPaisa: request.maxDiscountPaisa }),
      ...(request.maxRedemptions === undefined
        ? {}
        : { maxRedemptions: request.maxRedemptions }),
      ...(request.endsAt === undefined
        ? {}
        : { endsAt: new Date(request.endsAt) }),
    });

    return toCoupon(record);
  }

  public async update(
    couponId: string,
    request: UpdateCouponRequest,
  ): Promise<Coupon | null> {
    const record = await this.coupons.update(couponId, {
      ...(request.maxRedemptions === undefined
        ? {}
        : { maxRedemptions: request.maxRedemptions }),
      ...(request.perUserLimit === undefined
        ? {}
        : { perUserLimit: request.perUserLimit }),
      ...(request.endsAt === undefined
        ? {}
        : {
            endsAt: request.endsAt === null ? null : new Date(request.endsAt),
          }),
      ...(request.isActive === undefined ? {} : { isActive: request.isActive }),
    });

    return record === null ? null : toCoupon(record);
  }

  public async list(): Promise<readonly Coupon[]> {
    return (await this.coupons.list()).map(toCoupon);
  }

  /** Three ways to be not-running, each with its own sentence. */
  private assertRunning(coupon: CouponRecord): void {
    const now = new Date();

    if (!coupon.isActive) {
      throw new CouponNotRunningError('This offer is no longer available.');
    }

    if (coupon.startsAt > now) {
      throw new CouponNotRunningError('This offer has not started yet.');
    }

    if (coupon.endsAt !== null && coupon.endsAt <= now) {
      throw new CouponNotRunningError('This offer has ended.');
    }
  }
}

/**
 * What comes off one subtotal.
 *
 * Rounded down, and capped so a discount can never exceed the fare. A
 * negative total would fail the `fare_total_is_consistent` CHECK constraint,
 * which is the right place for that to be impossible rather than merely
 * unlikely.
 */
function discountFor(coupon: CouponRecord, subtotalPaisa: number): number {
  const raw =
    coupon.kind === CouponKind.PERCENT
      ? Math.floor((subtotalPaisa * coupon.value) / 100)
      : coupon.value;

  const capped =
    coupon.maxDiscountPaisa === null
      ? raw
      : Math.min(raw, coupon.maxDiscountPaisa);

  return Math.min(capped, subtotalPaisa);
}

function toCoupon(record: CouponRecord): Coupon {
  return {
    id: record.id,
    code: record.code,
    kind: record.kind,
    value: record.value,
    maxDiscountPaisa: record.maxDiscountPaisa,
    minFarePaisa: record.minFarePaisa,
    maxRedemptions: record.maxRedemptions,
    perUserLimit: record.perUserLimit,
    redeemedCount: record.redeemedCount,
    firstRideOnly: record.firstRideOnly,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt === null ? null : record.endsAt.toISOString(),
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
  };
}
