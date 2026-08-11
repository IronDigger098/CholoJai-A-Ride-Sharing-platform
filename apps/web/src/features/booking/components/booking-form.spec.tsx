import {
  type FareQuoteResponse,
  type Place,
  VehicleType,
} from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BookingForm } from './booking-form';

import { ApiError } from '@/lib/api-error';
import { renderWithProviders } from '@/testing/render-with-providers';

const DHANMONDI: Place = {
  id: '1',
  label: 'Dhanmondi 27, Dhaka',
  coordinates: { lat: 23.7461, lng: 90.376 },
};

const BANANI: Place = {
  id: '2',
  label: 'Banani 11, Dhaka',
  coordinates: { lat: 23.7936, lng: 90.4043 },
};

const QUOTE: FareQuoteResponse = {
  id: 'quote_1',
  distanceMetres: 8400,
  durationSeconds: 660,
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
  /* No campaign priced this one. The booking form's own behaviour is the
     same either way; the coupon field arrives in its own slice. */
  appliedCoupon: null,
  options: [
    {
      vehicleType: VehicleType.BIKE,
      breakdown: {
        base: 3000,
        distance: 9240,
        time: 660,
        discount: 0,
        total: 12_900,
      },
    },
    {
      vehicleType: VehicleType.CNG,
      breakdown: {
        base: 5000,
        distance: 12_600,
        time: 880,
        discount: 0,
        total: 18_480,
      },
    },
  ],
};

const mockSearchPlaces = jest.fn();
const mockRequestQuote = jest.fn();
const mockBookRide = jest.fn();

jest.mock('../api', () => ({
  searchPlaces: (query: string) => mockSearchPlaces(query),
  requestQuote: () => mockRequestQuote(),
  bookRide: () => mockBookRide(),
  reverseGeocode: () => Promise.resolve(null),
}));

/* The map is stubbed out here. Leaflet reads `window` at module scope and
   renders to a canvas jsdom does not implement, and none of these tests are
   about the map — they are about what the form does with two places once it
   has them, however they were chosen. */
jest.mock('./map-panel', () => ({
  MapPanel: () => null,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function expiredQuoteError(): ApiError {
  return new ApiError({
    type: 'https://cholojai.app/errors/quote-expired',
    title: 'Quote expired',
    status: 422,
    code: 'QUOTE_EXPIRED',
    detail: 'That price is no longer valid. Please get a new quote.',
  });
}

/** Fill both pickers and press "See prices". */
async function quoteAJourney(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  mockSearchPlaces.mockResolvedValue([DHANMONDI]);
  await user.type(screen.getByLabelText('Pickup'), 'dhanmondi');
  await user.click(
    await screen.findByRole('option', { name: DHANMONDI.label }),
  );

  mockSearchPlaces.mockResolvedValue([BANANI]);
  await user.type(screen.getByLabelText('Destination'), 'banani');
  await user.click(await screen.findByRole('option', { name: BANANI.label }));

  await user.click(screen.getByRole('button', { name: 'See prices' }));
}

describe('BookingForm', () => {
  beforeEach(() => {
    mockSearchPlaces.mockReset();
    mockRequestQuote.mockReset();
    mockBookRide.mockReset();
    mockRequestQuote.mockResolvedValue(QUOTE);
  });

  it('cannot ask for prices until both places are chosen', () => {
    renderWithProviders(<BookingForm />);

    expect(screen.getByRole('button', { name: 'See prices' })).toBeDisabled();
  });

  it('shows an option per vehicle type once quoted', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await quoteAJourney(user);

    expect(await screen.findByLabelText(/BIKE/u)).toBeInTheDocument();
    expect(screen.getByLabelText(/CNG/u)).toBeInTheDocument();
  });

  it('cannot confirm before a vehicle is chosen', async () => {
    /* The quote prices three vehicles; booking one is a separate decision.
       A default selection would book whatever happened to be first. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await quoteAJourney(user);

    expect(
      await screen.findByRole('button', { name: 'Confirm booking' }),
    ).toBeDisabled();
  });

  it('books the vehicle the rider selected', async () => {
    mockBookRide.mockResolvedValue({ id: 'ride_1' });
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await quoteAJourney(user);
    await user.click(await screen.findByLabelText(/CNG/u));
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    await waitFor(() => {
      expect(mockBookRide).toHaveBeenCalledTimes(1);
    });
  });

  it('sends the rider back to pricing when the quote expired', async () => {
    /* Leaving the options on screen would leave a Confirm button that fails
       identically every time it is pressed. Clearing them puts the rider
       back at "get a price", which is the only thing that can work. */
    mockBookRide.mockRejectedValue(expiredQuoteError());
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await quoteAJourney(user);
    await user.click(await screen.findByLabelText(/CNG/u));
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no longer valid/u,
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Confirm booking' }),
      ).not.toBeInTheDocument();
    });
  });

  it('reports a pricing failure without offering options', async () => {
    mockRequestQuote.mockRejectedValue(
      new ApiError({
        type: 'https://cholojai.app/errors/route-too-long',
        title: 'That journey is too long',
        status: 422,
        code: 'ROUTE_TOO_LONG',
        detail: 'We currently serve trips up to 100 km.',
      }),
    );

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await quoteAJourney(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/100 km/u);
    expect(
      screen.queryByRole('button', { name: 'Confirm booking' }),
    ).not.toBeInTheDocument();
  });
});
