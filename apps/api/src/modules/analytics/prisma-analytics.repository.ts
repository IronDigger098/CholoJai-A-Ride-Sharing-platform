import {
  ACTIVE_RIDE_STATUSES,
  DriverApplicationStatus,
  type PlatformNow,
  type PlatformTotals,
  RideStatus,
} from '@cholojai/shared';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type AnalyticsRepository,
  type RideDayCount,
} from './analytics-repository.port';

/**
 * PostgreSQL adapter for {@link AnalyticsRepository}.
 *
 * Every count here is a live aggregate over an indexed column. The schema
 * was built for it — `database-erd.md` N3 keeps the fare in five typed
 * integer columns rather than a JSON blob precisely so that summing revenue
 * is `SUM(fare_total_paisa)` and not a document scan.
 */
@Injectable()
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async totals(): Promise<PlatformTotals> {
    /* In parallel: they touch three different tables and nothing here
       depends on anything else here. */
    const [users, drivers, rides] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.driverProfile.count({
        where: { applicationStatus: DriverApplicationStatus.APPROVED },
      }),
      this.prisma.ride.aggregate({
        where: { status: RideStatus.COMPLETED },
        _count: { _all: true },
        _sum: { fareTotalPaisa: true },
      }),
    ]);

    return {
      users,
      drivers,
      ridesCompleted: rides._count._all,
      /* SUM over no rows is NULL, not zero. A platform with no completed
         rides has earned nothing, which is a number rather than an
         absence. */
      grossRevenuePaisa: rides._sum.fareTotalPaisa ?? 0,
    };
  }

  public async now(): Promise<PlatformNow> {
    const [ridesInProgress, applicationsPending] = await Promise.all([
      this.prisma.ride.count({
        /* The shared list, not a literal. It is the same set of states the
           `one_active_ride_per_rider` index is built on, and a second copy
           here would be one more thing to update when a state is added. */
        where: { status: { in: [...ACTIVE_RIDE_STATUSES] } },
      }),
      this.prisma.driverProfile.count({
        where: { applicationStatus: DriverApplicationStatus.PENDING },
      }),
    ]);

    return { ridesInProgress, applicationsPending };
  }

  /**
   * The one raw query in the codebase.
   *
   * Prisma's `groupBy` groups by column values, and there is no column
   * holding "the day this ride was requested" — only a timestamp. Deriving
   * one in the application would mean reading every row in the window and
   * bucketing them in Node, which is the work the database exists to do.
   *
   * `date_trunc` and `FILTER` are both ordinary SQL. Writing it out is
   * honest about the query being run; an ORM that could express it would be
   * generating this anyway.
   */
  public async ridesPerDay(since: Date): Promise<readonly RideDayCount[]> {
    const rows = await this.prisma.$queryRaw<RawDayRow[]>`
      SELECT to_char(date_trunc('day', requested_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*) FILTER (WHERE status = 'COMPLETED')  AS completed,
             COUNT(*) FILTER (WHERE status = 'CANCELLED')  AS cancelled
        FROM rides
       WHERE requested_at >= ${since}
       GROUP BY 1
       ORDER BY 1
    `;

    /* PostgreSQL's COUNT is bigint, which the driver hands over as a
       JavaScript BigInt. It has to be narrowed before it can be serialised
       — JSON.stringify throws on BigInt rather than guessing. */
    return rows.map((row) => ({
      date: row.date,
      completed: Number(row.completed),
      cancelled: Number(row.cancelled),
    }));
  }
}

/** What the raw query returns, before the bigints are narrowed. */
interface RawDayRow {
  date: string;
  completed: bigint;
  cancelled: bigint;
}
