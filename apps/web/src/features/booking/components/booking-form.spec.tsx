import {
  CouponKind,
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
  /* No campaign priced this one. The tests that are about a code build
     their own quote. */
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
  /* The request is forwarded, not swallowed. What the form puts in it —
     whether a code is present, and in what form — is the thing several of
     these tests are actually about. */
  requestQuote: (request: unknown) => mockRequestQuote(request),
  bookRide: (request: unknown) => mockBookRide(request),
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

function couponError(code: string, detail: string): ApiError {
  return new ApiError({
    type: `https://cholojai.app/errors/${code.toLowerCase()}`,
    title: 'That code did not apply',
    status: 422,
    code,
    detail,
  });
}

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

  it('leaves the code out of the request when none was typed', async () => {
    /* The contract's minimum is three characters, so an empty string would
       be a validation failure for a rider who simply has no code. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await quoteAJourney(user);

    await waitFor(() => {
      expect(mockRequestQuote).toHaveBeenCalledTimes(1);
    });
    expect(mockRequestQuote.mock.calls[0]?.[0]).not.toHaveProperty(
      'couponCode',
    );
  });

  it('sends a typed code with the journey it prices', async () => {
    /* One request, not two. A rider told their code is valid and then
       quoted without it has been told two different things. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await user.type(screen.getByLabelText('Promo code'), 'welcome10');
    await quoteAJourney(user);

    await waitFor(() => {
      expect(mockRequestQuote).toHaveBeenCalledTimes(1);
    });
    expect(mockRequestQuote.mock.calls[0]?.[0]).toMatchObject({
      couponCode: 'welcome10',
    });
  });

  it('names the campaign that priced the quote', async () => {
    mockRequestQuote.mockResolvedValue({
      ...QUOTE,
      appliedCoupon: {
        code: 'WELCOME10',
        kind: CouponKind.PERCENT,
        value: 10,
      },
    } satisfies FareQuoteResponse);

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await quoteAJourney(user);

    expect(await screen.findByText(/WELCOME10 applied/u)).toBeVisible();
  });

  it('puts a refused code on the field rather than in the banner', async () => {
    /* The journey priced fine and the code did not. A message in the banner
       above the form leaves the rider guessing which of the two inputs the
       complaint is about. */
    mockRequestQuote.mockRejectedValue(
      couponError('COUPON_NOT_FOUND', 'That code does not exist.'),
    );

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await user.type(screen.getByLabelText('Promo code'), 'nope');
    await quoteAJourney(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /does not exist/u,
    );
    expect(screen.getByLabelText('Promo code')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('offers no prices when the code was refused', async () => {
    /* Pricing without the code would show full prices to somebody who
       believes a discount applied. They would find out at the receipt, and
       by then the ride has happened. */
    mockRequestQuote.mockRejectedValue(
      couponError('COUPON_EXHAUSTED', 'This code has reached its limit.'),
    );

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<BookingForm />);

    await user.type(screen.getByLabelText('Promo code'), 'welcome10');
    await quoteAJourney(user);

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Confirm booking' }),
    ).not.toBeInTheDocument();
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
