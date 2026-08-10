import { type PlatformMetrics as Metrics } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PlatformMetrics } from './platform-metrics';

import { renderWithProviders } from '@/testing/render-with-providers';

const METRICS: Metrics = {
  totals: {
    users: 12,
    drivers: 3,
    ridesCompleted: 40,
    grossRevenuePaisa: 1_234_500,
  },
  now: { ridesInProgress: 2, applicationsPending: 1 },
  ridesPerDay: [
    { date: '2026-08-08', completed: 4, cancelled: 1 },
    { date: '2026-08-09', completed: 0, cancelled: 0 },
    { date: '2026-08-10', completed: 6, cancelled: 2 },
  ],
};

const mockMetrics = jest.fn();

jest.mock('../api', () => ({
  getPlatformMetrics: (days: number) => mockMetrics(days),
}));

describe('PlatformMetrics', () => {
  beforeEach(() => {
    mockMetrics.mockReset();
    mockMetrics.mockResolvedValue(METRICS);
  });

  it('shows what is happening right now', async () => {
    renderWithProviders(<PlatformMetrics />);

    expect(await screen.findByText('Rides in progress')).toBeVisible();
    expect(screen.getByText('Applications waiting')).toBeVisible();
  });

  it('formats revenue as taka', async () => {
    /* The API sends paisa. A dashboard that printed 1234500 would be
       reporting a number nobody asked for. */
    renderWithProviders(<PlatformMetrics />);

    expect(await screen.findByText('৳12,345')).toBeVisible();
  });

  it('opens on a fortnight', async () => {
    renderWithProviders(<PlatformMetrics />);

    await screen.findByText('Rides in progress');

    expect(mockMetrics).toHaveBeenCalledWith(14);
  });

  it('reloads when the window changes', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<PlatformMetrics />);

    await user.click(await screen.findByRole('button', { name: '7 days' }));

    await waitFor(() => {
      expect(mockMetrics).toHaveBeenLastCalledWith(7);
    });
  });

  it('carries the series in a table, not only in the bars', async () => {
    /* The bars are `aria-hidden`. Without the table a screen-reader user
       gets a heading and nothing under it. */
    renderWithProviders(<PlatformMetrics />);

    expect(
      await screen.findByRole('rowheader', { name: '2026-08-09' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Finished rides per day' }),
    ).toBeInTheDocument();
  });

  it('surfaces a failure instead of drawing an empty chart', async () => {
    mockMetrics.mockRejectedValue(new Error('Nope'));
    renderWithProviders(<PlatformMetrics />);

    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
