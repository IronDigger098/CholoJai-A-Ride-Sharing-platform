import { type Place } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PlaceSearch } from './place-search';

import { renderWithProviders } from '@/testing/render-with-providers';

const BANANI: Place = {
  id: '1',
  label: 'Banani 11, Dhaka',
  coordinates: { lat: 23.7936, lng: 90.4043 },
};

/* The `mock` prefix is required: `jest.mock` is hoisted above the imports,
   and its factory may only reference variables whose names begin with it. */
const mockSearchPlaces = jest.fn();

jest.mock('../api', () => ({
  searchPlaces: (query: string) => mockSearchPlaces(query),
}));

describe('PlaceSearch', () => {
  beforeEach(() => {
    mockSearchPlaces.mockReset();
    mockSearchPlaces.mockResolvedValue([BANANI]);
  });

  it('does not search for a single character', async () => {
    /* The server refuses a one-character query anyway — it matches most of
       the country. Not sending it saves a round trip to be told so. */
    const user = userEvent.setup();
    renderWithProviders(
      <PlaceSearch label="Pickup" value={null} onSelect={jest.fn()} />,
    );

    await user.type(screen.getByLabelText('Pickup'), 'b');

    await waitFor(() => {
      expect(mockSearchPlaces).not.toHaveBeenCalled();
    });
  });

  it('sends one request for a quickly typed query', async () => {
    /* The debounce. Without it a seven-character place name is seven
       requests to an upstream whose policy caps total volume. */
    const user = userEvent.setup();
    renderWithProviders(
      <PlaceSearch label="Pickup" value={null} onSelect={jest.fn()} />,
    );

    await user.type(screen.getByLabelText('Pickup'), 'banani');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: BANANI.label })).toBeVisible();
    });
    expect(mockSearchPlaces).toHaveBeenCalledTimes(1);
    expect(mockSearchPlaces).toHaveBeenCalledWith('banani');
  });

  it('reports the chosen place to its caller', async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <PlaceSearch label="Pickup" value={null} onSelect={onSelect} />,
    );

    await user.type(screen.getByLabelText('Pickup'), 'banani');
    await user.click(await screen.findByRole('option', { name: BANANI.label }));

    expect(onSelect).toHaveBeenCalledWith(BANANI);
  });

  it('closes the list once a place is chosen', async () => {
    /* A list still covering the next field after a selection is a control
       that looks broken. Driven by the selected value matching the text
       rather than by a separate open/closed flag that could disagree. */
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <PlaceSearch label="Pickup" value={null} onSelect={jest.fn()} />,
    );

    await user.type(screen.getByLabelText('Pickup'), 'banani');
    await user.click(await screen.findByRole('option', { name: BANANI.label }));

    rerender(
      <PlaceSearch label="Pickup" value={BANANI} onSelect={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('says so when nothing matches', async () => {
    mockSearchPlaces.mockResolvedValue([]);
    const user = userEvent.setup();

    renderWithProviders(
      <PlaceSearch label="Pickup" value={null} onSelect={jest.fn()} />,
    );

    await user.type(screen.getByLabelText('Pickup'), 'nowhere');

    expect(await screen.findByText('No places found')).toBeVisible();
  });
});
