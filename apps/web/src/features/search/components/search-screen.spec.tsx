import { SearchResultKind } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchScreen } from './search-screen';

import { renderWithProviders } from '@/testing/render-with-providers';

const BOX = /what are you looking for/iu;

const PLACE = {
  kind: SearchResultKind.PLACE,
  id: 'place-1',
  label: 'Office',
  address: 'Gulshan Avenue, Dhaka',
};

const RIDE = {
  kind: SearchResultKind.RIDE,
  id: 'ride-1',
  pickupAddress: 'Gulshan Avenue, Dhaka',
  dropoffAddress: 'Banani, Dhaka',
  farePaisa: 14_900,
  requestedAt: '2026-08-01T09:30:00.000Z',
};

const HELP = {
  kind: SearchResultKind.HELP,
  slug: 'promo-codes',
  question: 'How do I use a promo code?',
  answer: 'Enter it before you press "See prices".',
};

const mockSearch = jest.fn();

jest.mock('../api', () => ({
  search: (query: string) => mockSearch(query),
}));

describe('SearchScreen', () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockSearch.mockResolvedValue({ results: [] });
  });

  it('asks for two characters before searching anything', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SearchScreen />);

    await user.type(screen.getByLabelText(BOX), 'a');

    expect(screen.getByText(/at least 2 characters/iu)).toBeVisible();
    /* Not merely "no results shown" — no request was made at all. A
       one-character query is the most expensive scan with the least useful
       answer, which is why the floor exists. */
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('searches once for a burst of typing, not once per key', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SearchScreen />);

    await user.type(screen.getByLabelText(BOX), 'banani');

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith('banani');
    });

    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('renders each kind with the fields that make it useful', async () => {
    mockSearch.mockResolvedValue({ results: [PLACE, RIDE, HELP] });

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SearchScreen />);

    await user.type(screen.getByLabelText(BOX), 'banani');

    expect(await screen.findByText('Office')).toBeVisible();
    /* The ride shows its fare — the part a flattened title/subtitle shape
       would have thrown away. */
    expect(await screen.findByText(/৳/u)).toBeVisible();
    expect(await screen.findByText(HELP.question)).toBeVisible();
  });

  it('names each group with the shared label', async () => {
    mockSearch.mockResolvedValue({ results: [PLACE, RIDE, HELP] });

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SearchScreen />);

    await user.type(screen.getByLabelText(BOX), 'banani');

    expect(await screen.findByText('Saved places')).toBeVisible();
    expect(screen.getByText('Your rides')).toBeVisible();
    expect(screen.getByText('Help')).toBeVisible();
  });

  it('draws groups in SEARCH_KIND_ORDER even when the server does not', async () => {
    /* The server already sorts, and this renders from the same constant
       rather than trusting the array order — so a proxy that reordered the
       payload, or a future source appended at the end, still lands in the
       right section. */
    mockSearch.mockResolvedValue({ results: [HELP, RIDE, PLACE] });

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SearchScreen />);

    await user.type(screen.getByLabelText(BOX), 'banani');

    const headings = await screen.findAllByRole('heading', { level: 2 });

    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Saved places',
      'Your rides',
      'Help',
    ]);
  });

  it('omits a section that matched nothing', async () => {
    mockSearch.mockResolvedValue({ results: [HELP] });

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SearchScreen />);

    await user.type(screen.getByLabelText(BOX), 'promo');

    expect(await screen.findByText('Help')).toBeVisible();
    /* An empty "Saved places" heading would promise a category and deliver
       nothing, which reads as a bug rather than as an absence. */
    expect(screen.queryByText('Saved places')).not.toBeInTheDocument();
  });

  it('says when nothing matched', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SearchScreen />);

    await user.type(screen.getByLabelText(BOX), 'zzzzz');

    expect(await screen.findByText(/nothing matched/iu)).toBeVisible();
  });

  it('says so when the search fails', async () => {
    mockSearch.mockRejectedValue(new Error('Network unreachable.'));

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SearchScreen />);

    await user.type(screen.getByLabelText(BOX), 'banani');

    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
