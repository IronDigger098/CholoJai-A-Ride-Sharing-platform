import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateReviewInput,
  type ReviewRecord,
  type ReviewRepository,
} from './review-repository.port';
import { AlreadyRatedError } from './reviews.errors';

/** PostgreSQL adapter for {@link ReviewRepository}. */
@Injectable()
export class PrismaReviewRepository implements ReviewRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateReviewInput): Promise<ReviewRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            rideId: input.rideId,
            authorId: input.authorId,
            targetId: input.targetId,
            rating: input.rating,
            comment: input.comment ?? null,
          },
        });

        /* Recomputed from the reviews themselves rather than folded into
           the previous average. An incremental update is one rounding rule
           away from drifting, and drift in a stored average is invisible —
           there is nothing to compare it against. This way the cache is
           correct after every write, and self-healing after any that were
           not. */
        const stats = await tx.review.aggregate({
          where: { targetId: input.targetId },
          _avg: { rating: true },
          _count: { _all: true },
        });

        /* `updateMany`, not `update`. The target may have no driver profile
           — they will not, the day a driver rates a rider — and updating
           zero rows should be nothing happening, not an exception. */
        await tx.driverProfile.updateMany({
          where: { userId: input.targetId },
          data: {
            ratingAvgX100: Math.round((stats._avg.rating ?? 0) * 100),
            ratingCount: stats._count._all,
          },
        });

        return toRecord(review);
      });
    } catch (error) {
      /* The composite index reports both columns. Matching on `author_id`
         alone would also catch an index that did not exist. */
      if (isUniqueViolation(error, 'author_id')) throw new AlreadyRatedError();
      throw error;
    }
  }

  public async findByRideAndAuthor(
    rideId: string,
    authorId: string,
  ): Promise<ReviewRecord | null> {
    const row = await this.prisma.review.findUnique({
      where: { rideId_authorId: { rideId, authorId } },
    });

    return row === null ? null : toRecord(row);
  }
}

function isUniqueViolation(error: unknown, column: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  /* Prisma reports the database column, observed in M5's ride repository. */
  const target = error.meta?.['target'];

  return typeof target === 'string'
    ? target === column
    : Array.isArray(target) && target.includes(column);
}

interface ReviewRow {
  id: string;
  rideId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

function toRecord(row: ReviewRow): ReviewRecord {
  return {
    id: row.id,
    rideId: row.rideId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt,
  };
}
