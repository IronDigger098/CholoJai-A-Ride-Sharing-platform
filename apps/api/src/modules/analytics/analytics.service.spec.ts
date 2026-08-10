import { type PlatformNow, type PlatformTotals } from '@cholojai/shared';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import {
  type AnalyticsRepository,
  type RideDayCount,
} from './analytics-repository.port';
import { AnalyticsService } from './analytics.service';

const TOTALS: PlatformTotals = {
  users: 12,
  drivers: 3,
  ridesCompleted: 40,
  grossRevenuePaisa: 1_234_500,
};

const NOW: PlatformNow = { ridesInProgress: 2, applicationsPending: 1 };

/** Records the window it was asked for, so the boundary can be asserted. */
function makeService(rows: RideDayCount[] = []): {
  service: AnalyticsService;
  windows: Date[];
} {
  const windows: Date[] = [];

  const repository: AnalyticsRepository = {
    totals: () => Promise.resolve(TOTALS),
    now: () => Promise.resolve(NOW),
    ridesPerDay: (since: Date) => {
      windows.push(since);
      return Promise.resolve(rows);
    },
  };

  return { service: new AnalyticsService(repository), windows };
}

describe('AnalyticsService', () => {
  beforeEach(() => {
    /* Mid-afternoon on purpose. A window built from the current instant
       rather than the current day would start at 13:45 and the assertions
       below would say so. */
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T13:45:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns one entry per day, oldest first, ending today', async () => {
    const { service } = makeService();

    const metrics = await service.metrics({ days: 7 });

    expect(metrics.ridesPerDay).toHaveLength(7);
    expect(metrics.ridesPerDay[0]?.date).toBe('2026-08-04');
    expect(metrics.ridesPerDay.at(-1)?.date).toBe('2026-08-10');
  });

  it('counts whole calendar days, not the last N hours', async () => {
    /* `days: 7` means today and the six before it. A rolling window would
       move its own boundary every time the page was opened, so yesterday's
       total would change during the afternoon. */
    const { service, windows } = makeService();

    await service.metrics({ days: 7 });

    expect(windows[0]?.toISOString()).toBe('2026-08-04T00:00:00.000Z');
  });

  it('fills a day that had no rides with zeros', async () => {
    /* The database returns only days with rows. Passing those straight
       through would draw a chart where a quiet day does not exist and its
       neighbour sits where it should be — a gap that reads as continuity. */
    const { service } = makeService([
      { date: '2026-08-08', completed: 4, cancelled: 1 },
    ]);

    const metrics = await service.metrics({ days: 3 });

    expect(metrics.ridesPerDay).toEqual([
      { date: '2026-08-08', completed: 4, cancelled: 1 },
      { date: '2026-08-09', completed: 0, cancelled: 0 },
      { date: '2026-08-10', completed: 0, cancelled: 0 },
    ]);
  });

  it('ignores a day the database returned from outside the window', async () => {
    const { service } = makeService([
      { date: '2026-07-01', completed: 9, cancelled: 9 },
    ]);

    const metrics = await service.metrics({ days: 2 });

    expect(metrics.ridesPerDay.map((day) => day.date)).toEqual([
      '2026-08-09',
      '2026-08-10',
    ]);
  });

  it('passes the totals through untouched', async () => {
    /* Nothing is derived from them here. A revenue figure that the service
       recomputed would be a second place for the number to be wrong. */
    const { service } = makeService();

    const metrics = await service.metrics({ days: 1 });

    expect(metrics.totals).toEqual(TOTALS);
    expect(metrics.now).toEqual(NOW);
  });
});
