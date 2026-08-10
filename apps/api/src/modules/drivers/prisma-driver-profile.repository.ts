import {
  type DriverApplicationStatus,
  DriverApplicationStatus as Status,
} from '@cholojai/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateDriverProfileInput,
  type DecideApplicationInput,
  type DriverApplicationRecord,
  type DriverProfileRecord,
  type DriverProfileRepository,
} from './driver-profile-repository.port';
import { AlreadyAppliedError } from './drivers.errors';

/** Shape of the row this adapter reads. */
interface ProfileRow {
  id: string;
  userId: string;
  applicationStatus: string;
  rejectionReason: string | null;
  licenseNoMasked: string | null;
  isAvailable: boolean;
  ratingAvgX100: number;
  ratingCount: number;
  approvedAt: Date | null;
  createdAt: Date;
}

interface ProfileWithUserRow extends ProfileRow {
  user: { fullName: string; email: string };
}

/** PostgreSQL adapter for {@link DriverProfileRepository}. */
@Injectable()
export class PrismaDriverProfileRepository implements DriverProfileRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(
    input: CreateDriverProfileInput,
  ): Promise<DriverProfileRecord> {
    try {
      const row: ProfileRow = await this.prisma.driverProfile.create({
        data: {
          userId: input.userId,
          licenseNoMasked: input.licenseNoMasked,
        },
      });

      return toRecord(row);
    } catch (error) {
      /* `user_id` is uniquely indexed, so a second application is the
         database refusing rather than a race this service could have
         prevented with a read. */
      if (isUniqueViolation(error, 'user_id')) throw new AlreadyAppliedError();
      throw error;
    }
  }

  public async findByUserId(
    userId: string,
  ): Promise<DriverProfileRecord | null> {
    const row: ProfileRow | null = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });

    return row === null ? null : toRecord(row);
  }

  public async findById(id: string): Promise<DriverProfileRecord | null> {
    const row: ProfileRow | null = await this.prisma.driverProfile.findUnique({
      where: { id },
    });

    return row === null ? null : toRecord(row);
  }

  public async listByStatus(
    status: DriverApplicationStatus,
  ): Promise<readonly DriverApplicationRecord[]> {
    const rows: ProfileWithUserRow[] = await this.prisma.driverProfile.findMany(
      {
        where: { applicationStatus: status },
        /* Oldest first: a review queue is a queue, and the person who has
           been waiting longest should not be at the bottom of it. */
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { fullName: true, email: true } } },
      },
    );

    return rows.map((row) => ({
      ...toRecord(row),
      fullName: row.user.fullName,
      email: row.user.email,
    }));
  }

  public async decide(
    input: DecideApplicationInput,
  ): Promise<DriverProfileRecord | null> {
    /* `updateMany` with the expected status in the WHERE clause: two
       administrators deciding the same application produce one write and
       one `count: 0`. */
    const result = await this.prisma.driverProfile.updateMany({
      where: { id: input.driverProfileId, applicationStatus: Status.PENDING },
      data: {
        applicationStatus: input.status,
        ...(input.status === Status.APPROVED
          ? { approvedAt: input.at }
          : { rejectionReason: input.rejectionReason ?? null }),
      },
    });

    if (result.count !== 1) return null;

    return this.findById(input.driverProfileId);
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

function toRecord(row: ProfileRow): DriverProfileRecord {
  return {
    id: row.id,
    userId: row.userId,
    applicationStatus: row.applicationStatus as DriverApplicationStatus,
    rejectionReason: row.rejectionReason,
    licenseNoMasked: row.licenseNoMasked,
    isAvailable: row.isAvailable,
    ratingAvgX100: row.ratingAvgX100,
    ratingCount: row.ratingCount,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
  };
}
