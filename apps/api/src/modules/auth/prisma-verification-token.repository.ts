import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateVerificationTokenInput,
  type VerificationPurpose,
  type VerificationTokenRecord,
  type VerificationTokenRepository,
} from './verification-token-repository.port';

/** Shape of the row this adapter reads. */
interface TokenRow {
  id: string;
  userId: string;
  purpose: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

/**
 * PostgreSQL adapter for {@link VerificationTokenRepository}.
 */
@Injectable()
export class PrismaVerificationTokenRepository implements VerificationTokenRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateVerificationTokenInput): Promise<void> {
    await this.prisma.verificationToken.create({
      data: {
        userId: input.userId,
        purpose: input.purpose,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  public async findByHash(
    tokenHash: string,
    purpose: VerificationPurpose,
  ): Promise<VerificationTokenRecord | null> {
    const row: TokenRow | null = await this.prisma.verificationToken.findUnique(
      {
        where: { tokenHash },
      },
    );

    if (row === null) return null;

    // The hash column is globally unique across purposes, so a row could in
    // principle belong to a different flow. Checking here is what stops a
    // password-reset token being redeemed as an email verification.
    if (row.purpose !== purpose) return null;

    return toRecord(row);
  }

  /**
   * Mark a token consumed, atomically.
   *
   * `updateMany` with `consumedAt: null` in the WHERE clause is the whole
   * single-use guarantee: PostgreSQL evaluates the condition and performs
   * the write in one statement, so two requests racing with the same token
   * produce exactly one `count: 1`. A read-then-write in application code
   * would let both pass the check before either wrote.
   */
  public async consume(tokenId: string): Promise<boolean> {
    const result = await this.prisma.verificationToken.updateMany({
      where: { id: tokenId, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    return result.count === 1;
  }

  /**
   * Delete outstanding tokens rather than marking them consumed.
   *
   * These rows carry no history worth keeping — the audit trail that
   * matters is `users.emailVerifiedAt`. Deleting also keeps the table from
   * growing without bound for users who request many links.
   */
  public async revokeAllForUser(
    userId: string,
    purpose: VerificationPurpose,
  ): Promise<void> {
    await this.prisma.verificationToken.deleteMany({
      where: { userId, purpose, consumedAt: null },
    });
  }
}

function toRecord(row: TokenRow): VerificationTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    purpose: row.purpose as VerificationPurpose,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
  };
}
