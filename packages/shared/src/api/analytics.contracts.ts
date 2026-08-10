import { z } from 'zod';

/**
 * Platform metrics — `docs/roadmap.md` M8.
 *
 * Computed live from the tables that already hold the answer rather than
 * from a rollup written by a nightly job. At this volume a handful of
 * indexed aggregates cost less than the machinery that would keep a summary
 * current, and a number that is always right needs no explanation of how
 * stale it might be.
 *
 * The shape deliberately says nothing about how it is produced. The day the
 * rides table makes live aggregation too slow, a materialised view can sit
 * behind this same contract and no client changes.
 */

const count = z.number().int().nonnegative();

export const platformTotalsSchema = z.object({
  users: count,
  /** Approved drivers, not applicants. */
  drivers: count,
  ridesCompleted: count,
  /**
   * Paisa, summed from the fare snapshots on the rides themselves.
   *
   * So revenue for a past month never moves when pricing changes — the same
   * property decision D2 buys for a single receipt, at platform scale.
   */
  grossRevenuePaisa: count,
});

export type PlatformTotals = z.infer<typeof platformTotalsSchema>;

/**
 * What is happening right now.
 *
 * Separated from the totals because it answers a different question. A
 * total is history and changes slowly; these two are a worklist, and an
 * administrator reads them to decide what to do in the next ten minutes.
 */
export const platformNowSchema = z.object({
  ridesInProgress: count,
  applicationsPending: count,
});

export type PlatformNow = z.infer<typeof platformNowSchema>;

/** One day of the series. `date` is a UTC calendar day, `YYYY-MM-DD`. */
export const ridesOnDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  completed: count,
  cancelled: count,
});

export type RidesOnDay = z.infer<typeof ridesOnDaySchema>;

export const platformMetricsSchema = z.object({
  totals: platformTotalsSchema,
  now: platformNowSchema,
  /**
   * Every day in the window, including the ones with no rides.
   *
   * The database returns only days that have rows. Sending those straight
   * through would draw a chart where a quiet Friday does not exist and the
   * next bar sits where it should be — a gap that reads as continuity.
   */
  ridesPerDay: z.array(ridesOnDaySchema),
});

export type PlatformMetrics = z.infer<typeof platformMetricsSchema>;

/**
 * How far back the series runs.
 *
 * Capped for the same reason `limit` is: the window is the query's cost,
 * and an uncapped one is a full table scan a caller can ask for by hand.
 */
export const platformMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14),
});

export type PlatformMetricsQuery = z.infer<typeof platformMetricsQuerySchema>;
