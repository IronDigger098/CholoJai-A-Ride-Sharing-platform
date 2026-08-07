import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateRefreshTokenInput,
  type RefreshTokenRecord,
  type RefreshTokenRepository,
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
