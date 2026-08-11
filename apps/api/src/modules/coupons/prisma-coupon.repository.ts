import { type CouponKind, RideStatus } from '@cholojai/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CouponRecord,
  type CouponRepository,
  type CreateCouponInput,
  type RedeemCouponInput,
  type UpdateCouponInput,
} from './coupon-repository.port';
import { CouponCodeTakenError } from './coupons.errors';

/** PostgreSQL adapter for {@link CouponRepository}. */
@Injectable()
export class PrismaCouponRepository implements CouponRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateCouponInput): Promise<CouponRecord> {
    try {
      const row = await this.prisma.coupon.create({
        data: {
          code: input.code,
          kind: input.kind,
          value: input.value,
          maxDiscountPaisa: input.maxDiscountPaisa ?? null,
          minFarePaisa: input.minFarePaisa,
          maxRedemptions: input.maxRedemptions ?? null,
          perUserLimit: input.perUserLimit,
          firstRideOnly: input.firstRideOnly,
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
        },
      });

      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error, 'code')) {
        throw new CouponCodeTakenError(input.code);
      }
      throw error;
    }
  }

  public async update(
    couponId: string,
    input: UpdateCouponInput,
  ): Promise<CouponRecord | null> {
    /* `updateMany` so an unknown id is zero rows rather than an exception —
       the service turns that into a 404 with a message of its own. */
    const changed = await this.prisma.coupon.updateMany({
      where: { id: couponId },
      data: {
        ...(input.maxRedemptions === undefined
          ? {}
          : { maxRedemptions: input.maxRedemptions }),
        ...(input.perUserLimit === undefined
          ? {}
          : { perUserLimit: input.perUserLimit }),
        ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });

    if (changed.count === 0) return null;

    const row = await this.prisma.coupon.findUnique({
      where: { id: couponId },
    });

    return row === null ? null : toRecord(row);
  }

  public async findByCode(code: string): Promise<CouponRecord | null> {
    const row = await this.prisma.coupon.findUnique({ where: { code } });

    return row === null ? null : toRecord(row);
  }

  public async list(): Promise<readonly CouponRecord[]> {
    const rows = await this.prisma.coupon.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(toRecord);
  }

  public async countRedemptionsBy(
    couponId: string,
    userId: string,
  ): Promise<number> {
    return this.prisma.couponRedemption.count({
      where: { couponId, userId },
    });
  }

  public async hasCompletedRide(userId: string): Promise<boolean> {
    const ride = await this.prisma.ride.findFirst({
      where: { riderId: userId, status: RideStatus.COMPLETED },
      select: { id: true },
    });

    return ride !== null;
  }

  public async redeem(input: RedeemCouponInput): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        /* Raw SQL because this compares two columns of the same row —
           `redeemed_count < max_redemptions` — which Prisma's `updateMany`
           filters cannot express. The comparison has to happen inside the
           UPDATE rather than in a preceding read: a read is a guess about a
           number another transaction is changing at the same moment. */
        const consumed = await tx.$executeRaw`
          UPDATE coupons
             SET redeemed_count = redeemed_count + 1
           WHERE id = ${input.couponId}
             AND is_active = true
             AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
        `;

        if (consumed === 0) return false;

        await tx.couponRedemption.create({
          data: {
            couponId: input.couponId,
            userId: input.userId,
            rideId: input.rideId,
            amountPaisa: input.amountPaisa,
          },
        });

        return true;
      });
    } catch (error) {
      /* One redemption per ride, enforced by the unique index. A retry that
         already succeeded reports false rather than raising: the caller's
         intent — this ride has spent this coupon — is already true. */
      if (isUniqueViolation(error, 'ride_id')) return false;
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown, column: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  const target = error.meta?.['target'];

  return typeof target === 'string'
    ? target === column
    : Array.isArray(target) && target.includes(column);
}

interface CouponRow {
  id: string;
  code: string;
  kind: string;
  value: number;
  maxDiscountPaisa: number | null;
  minFarePaisa: number;
  maxRedemptions: number | null;
  perUserLimit: number;
  redeemedCount: number;
  firstRideOnly: boolean;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

function toRecord(row: CouponRow): CouponRecord {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as CouponKind,
    value: row.value,
    maxDiscountPaisa: row.maxDiscountPaisa,
    minFarePaisa: row.minFarePaisa,
    maxRedemptions: row.maxRedemptions,
    perUserLimit: row.perUserLimit,
    redeemedCount: row.redeemedCount,
    firstRideOnly: row.firstRideOnly,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}
