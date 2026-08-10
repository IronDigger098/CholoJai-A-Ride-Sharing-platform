import { type Review } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RateRide } from './rate-ride';

import { renderWithProviders } from '@/testing/render-with-providers';

const REVIEW: Review = {
  id: 'review_1',
  rideId: 'ride_1',
  rating: 4,
  comment: 'Smooth run.',
  createdAt: '2026-08-10T09:00:00.000Z',
};

const mockGetMyReview = jest.fn();
const mockSubmitReview = jest.fn();

jest.mock('../api', () => ({
  getMyReview: (rideId: string) => mockGetMyReview(rideId),
  submitReview: (input: unknown) => mockSubmitReview(input),
}));

describe('RateRide', () => {
  beforeEach(() => {
    mockGetMyReview.mockReset();
    mockSubmitReview.mockReset();
    mockGetMyReview.mockResolvedValue(null);
    mockSubmitReview.mockResolvedValue(REVIEW);
  });

  it('offers a rating when the ride has not been rated', async () => {
    renderWithProviders(<RateRide rideId="ride_1" />);

    expect(await screen.findByText('How was your ride?')).toBeVisible();
    expect(screen.getByLabelText('5 stars')).toBeInTheDocument();
  });

  it('names one star in the singular', async () => {
    /* "1 stars" is the kind of thing only a screen-reader user hears, which
       is exactly why it is worth a test. */
    renderWithProviders(<RateRide rideId="ride_1" />);

    expect(await screen.findByLabelText('1 star')).toBeInTheDocument();
  });

  it('sends the chosen rating', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RateRide rideId="ride_1" />);

    await user.click(await screen.findByLabelText('5 stars'));
    await user.click(screen.getByRole('button', { name: 'Submit rating' }));

    expect(mockSubmitReview).toHaveBeenCalledWith({
      rideId: 'ride_1',
      rating: 5,
      comment: '',
    });
  });

  it('sends a comment when one is written', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RateRide rideId="ride_1" />);

    await user.click(await screen.findByLabelText('3 stars'));
    await user.type(screen.getByLabelText('Anything to add?'), 'Long way.');
    await user.click(screen.getByRole('button', { name: 'Submit rating' }));

    expect(mockSubmitReview).toHaveBeenCalledWith({
      rideId: 'ride_1',
      rating: 3,
      comment: 'Long way.',
    });
  });

  it('refuses to submit without a rating', async () => {
    /* The comment is optional; the star is the whole point. */
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RateRide rideId="ride_1" />);

    await user.click(
      await screen.findByRole('button', { name: 'Submit rating' }),
    );

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(mockSubmitReview).not.toHaveBeenCalled();
  });

  it('shows a rating already left, with no way to change it', async () => {
    /* The API refuses a second rating, so an edit control could only ever
       produce an error message. */
    mockGetMyReview.mockResolvedValue(REVIEW);
    renderWithProviders(<RateRide rideId="ride_1" />);

    expect(await screen.findByText('Smooth run.')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Submit rating' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces a refusal from the server', async () => {
    mockSubmitReview.mockRejectedValue(new Error('Already rated'));
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RateRide rideId="ride_1" />);

    await user.click(await screen.findByLabelText('2 stars'));
    await user.click(screen.getByRole('button', { name: 'Submit rating' }));

    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
