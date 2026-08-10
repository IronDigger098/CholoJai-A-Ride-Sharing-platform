import {
  type PlatformMetrics,
  type PlatformMetricsQuery,
  type RidesOnDay,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import {
  ANALYTICS_REPOSITORY,
  type AnalyticsRepository,
  type RideDayCount,
} from './analytics-repository.port';

/** A UTC day in milliseconds. Exact, because UTC has no daylight saving. */
const DAY_MS = 86_400_000;

/**
 * Platform metrics.
 *
 * The repository answers what the database knows. This service answers what
 * a chart needs, and the difference between the two is the whole of its
 * logic: the database returns days that had rides, a chart needs every day
 * in the window.
 */
@Injectable()
export class AnalyticsService {
  public constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly analytics: AnalyticsRepository,
  ) {}

  public async metrics(query: PlatformMetricsQuery): Promise<PlatformMetrics> {
    /* The window is whole UTC days ending today, so `days: 7` means today
       and the six before it — not the last 168 hours. An administrator
       comparing Tuesday with Monday wants calendar days; a rolling window
       would move the boundary every time the page is opened. */
    const since = addDays(startOfUtcDay(new Date()), -(query.days - 1));

    const [totals, now, series] = await Promise.all([
      this.analytics.totals(),
      this.analytics.now(),
      this.analytics.ridesPerDay(since),
    ]);

    return { totals, now, ridesPerDay: fillGaps(since, query.days, series) };
  }
}

/**
 * Every day in the window, in order, zeros included.
 *
 * Built from the calendar and filled from the query rather than the other
 * way round. Iterating the rows would produce a series whose length depends
 * on how busy the platform was, and a chart drawn from it would put a quiet
 * Friday's neighbour where the Friday should be — a gap that reads as
 * continuity rather than as nothing having happened.
 */
function fillGaps(
  since: Date,
  days: number,
  rows: readonly RideDayCount[],
): RidesOnDay[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));

  return Array.from({ length: days }, (_unused, offset) => {
    const date = utcDay(addDays(since, offset));
    const row = byDate.get(date);

    return {
      date,
      completed: row?.completed ?? 0,
      cancelled: row?.cancelled ?? 0,
    };
  });
}

function startOfUtcDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}

function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}

function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}
