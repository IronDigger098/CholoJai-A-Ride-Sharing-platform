import { type PlatformNow, type PlatformTotals } from '@cholojai/shared';

/**
 * What the analytics feature needs from persistence.
 *
 * Three reads rather than one, because they answer three questions with
 * three different costs. Bundling them into a single `metrics()` would hide
 * that the series is the expensive one, and would make the window a
 * parameter of everything.
 */

/**
 * A day that had at least one finished ride.
 *
 * Only days with rows come back — filling the gaps is the service's job,
 * because "no rides that Friday" is a fact about the calendar rather than
 * something the database can be asked for.
 */
export interface RideDayCount {
  /** UTC calendar day, `YYYY-MM-DD`. */
  readonly date: string;
  readonly completed: number;
  readonly cancelled: number;
}

export interface AnalyticsRepository {
  totals(): Promise<PlatformTotals>;

  now(): Promise<PlatformNow>;

  /** Finished rides per day, from `since` (inclusive) to now. */
  ridesPerDay(since: Date): Promise<readonly RideDayCount[]>;
}

export const ANALYTICS_REPOSITORY = Symbol('ANALYTICS_REPOSITORY');
