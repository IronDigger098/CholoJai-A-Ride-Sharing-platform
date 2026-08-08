import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateRefreshTokenInput,
  type RefreshTokenRecord,
  type RefreshTokenRepository,
  type RotateRefreshTokenInput,
} from './refresh-token-repository.port';

/** The columns this adapter reads. Declared so the mapping is checked. */
interface RefreshTokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

/** PostgreSQL adapter for {@link RefreshTokenRepository}. */
@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(
    input: CreateRefreshTokenInput,
  ): Promise<RefreshTokenRecord> {
    const row: RefreshTokenRow = await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
      },
    });

    return toRecord(row);
  }

  public async findByHash(
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null> {
    const row: RefreshTokenRow | null =
      await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    return row === null ? null : toRecord(row);
  }

  /**
   * Revoke the family in one statement.
   *
   * `revokedAt: null` in the WHERE clause keeps the original revocation
   * timestamps intact — re-revoking a family (which M3.5 will do on reuse
   * detection, possibly after a sign-out already revoked part of it) must
   * not rewrite when each token actually died. That timestamp is the audit
   * trail.
   */
  public async revokeFamily(familyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }

  /** Revoke every live token a user holds, in one statement. */
  public async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }

  /**
   * Rotate inside a transaction.
   *
   * The conditional `updateMany` is the concurrency control. PostgreSQL
   * takes a row lock, then re-evaluates `revoked_at IS NULL` after
   * acquiring it, so of two transactions racing on the same row exactly
   * one sees `count === 1`. The loser gets 0 and we abandon the rotation
   * rather than creating a second live token in the family.
   *
   * All three statements share one transaction because a partial rotation
   * is worse than no rotation: a revoked token with no successor would
   * sign the user out, and a successor whose predecessor is still live
   * would defeat reuse detection entirely.
   *
   * The successor is created before `replacedById` can be set, because
   * that column needs the new row's generated id. That ordering is why
   * this is three statements rather than two.
   */
  public rotate(
    input: RotateRefreshTokenInput,
  ): Promise<RefreshTokenRecord | null> {
    /* `tx` is annotated rather than inferred. Prisma types the callback
       parameter itself, but leaving it implicit means a Prisma upgrade that
       changes the signature turns into an `any` — and an `any` on the
       object that performs the writes is the last place we want one. */
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const retired = await tx.refreshToken.updateMany({
        where: { id: input.currentId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (retired.count !== 1) return null;

      const successor: RefreshTokenRow = await tx.refreshToken.create({
        data: {
          userId: input.successor.userId,
          tokenHash: input.successor.tokenHash,
          familyId: input.successor.familyId,
          expiresAt: input.successor.expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: input.currentId },
        data: { replacedById: successor.id },
      });

      return toRecord(successor);
    });
  }

  /**
   * The family's first `created_at`.
   *
   * An indexed aggregate — `family_id` carries an index from the original
   * schema — rather than a column duplicated onto every row. One cheap
   * read per refresh is a better trade than a denormalised field that can
   * drift from the rows it describes.
   */
  public async familyStartedAt(familyId: string): Promise<Date | null> {
    const result = await this.prisma.refreshToken.aggregate({
      where: { familyId },
      _min: { createdAt: true },
    });

    return result._min.createdAt ?? null;
  }
}

function toRecord(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedById: row.replacedById,
  };
}
