import {
  type Ride,
  type RidePage,
  RideStatus,
  VehicleType,
} from '@cholojai/shared';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RideHistory } from './ride-history';

import { ApiError } from '@/lib/api-error';
import { renderWithProviders } from '@/testing/render-with-providers';

/* Global `jest`, not the @jest/globals import: jest.mock is hoisted above
   the module imports and cannot be hoisted above the import defining it. */
const mockListRides = jest.fn();

jest.mock('../api', () => ({
  listRides: (query: unknown) => mockListRides(query),
}));

function ride(id: string, dropoffAddress: string): Ride {
  return {
    id,
    status: RideStatus.COMPLETED,
    vehicleType: VehicleType.CNG,
    pickup: { lat: 23.7461, lng: 90.376 },
    pickupAddress: 'Dhanmondi 27',
    dropoff: { lat: 23.7936, lng: 90.4043 },
    dropoffAddress,
    distanceMetres: 8400,
    durationSeconds: 660,
    fare: {
      base: 5000,
      distance: 12_600,
      time: 880,
      discount: 0,
      total: 18_480,
    },
    requestedAt: new Date('2026-08-01T10:00:00Z').toISOString(),
  };
}

function page(rides: Ride[], nextCursor: string | null): RidePage {
  return {
    data: rides,
    pageInfo: { nextCursor, hasNextPage: nextCursor !== null },
  };
}

describe('RideHistory', () => {
  beforeEach(() => {
    mockListRides.mockReset();
  });

  it('invites a first booking when there is no history', async () => {
    mockListRides.mockResolvedValue(page([], null));
    renderWithProviders(<RideHistory />);

    expect(await screen.findByText(/No rides yet/u)).toBeVisible();
  });

  it('lists rides newest first, as the server ordered them', async () => {
    mockListRides.mockResolvedValue(
      page([ride('r1', 'Banani 11'), ride('r2', 'Gulshan 2')], null),
    );
    renderWithProviders(<RideHistory />);

    const links = await screen.findAllByRole('link');

    expect(links[0]).toHaveTextContent('Banani 11');
    expect(links[1]).toHaveTextContent('Gulshan 2');
  });

  it('hides the pagination control on the last page', async () => {
    /* nextCursor null is how the server says "that is everything". A button
       that stayed would refetch the same page forever. */
    mockListRides.mockResolvedValue(page([ride('r1', 'Banani 11')], null));
    renderWithProviders(<RideHistory />);

    await screen.findByRole('link');

    expect(
      screen.queryByRole('button', { name: 'Show older rides' }),
    ).not.toBeInTheDocument();
  });

  it('appends the next page rather than replacing the current one', async () => {
    /* The property that separates a cursor list from a paged one: older
       rides are added below, so a rider never loses the place they were
       reading. */
    mockListRides
      .mockResolvedValueOnce(page([ride('r1', 'Banani 11')], 'r1'))
      .mockResolvedValueOnce(page([ride('r2', 'Gulshan 2')], null));

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RideHistory />);

    await user.click(
      await screen.findByRole('button', { name: 'Show older rides' }),
    );

    expect(await screen.findByText('Gulshan 2')).toBeVisible();
    expect(screen.getByText('Banani 11')).toBeVisible();
  });

  it('sends the previous page’s cursor when asked for more', async () => {
    mockListRides
      .mockResolvedValueOnce(page([ride('r1', 'Banani 11')], 'cursor-1'))
      .mockResolvedValueOnce(page([ride('r2', 'Gulshan 2')], null));

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RideHistory />);

    await user.click(
      await screen.findByRole('button', { name: 'Show older rides' }),
    );

    await screen.findByText('Gulshan 2');
    expect(mockListRides).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-1' }),
    );
  });

  it('reports a failure instead of an empty list', async () => {
    /* An error rendered as "no rides yet" tells a rider their history is
       gone. Distinguishing the two is the whole point of handling it. */
    mockListRides.mockRejectedValue(
      new ApiError({
        type: 'https://cholojai.app/errors/internal-error',
        title: 'Something went wrong',
        status: 500,
        code: 'INTERNAL_ERROR',
        detail: 'Something went wrong at our end. Please try again.',
      }),
    );

    renderWithProviders(<RideHistory />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/our end/u);
    expect(screen.queryByText(/No rides yet/u)).not.toBeInTheDocument();
  });
});
