import { MAX_SAVED_PLACES } from '@cholojai/shared';
/* `jest` is the global, not the `@jest/globals` import — `jest.mock` must be
   hoisted above the module imports, and it cannot be hoisted above the
   import that would define it. */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SavedPlaces } from './saved-places';

import { renderWithProviders } from '@/testing/render-with-providers';

const OFFICE = {
  id: 'place-1',
  label: 'Office',
  address: 'Gulshan Avenue, Dhaka',
  coordinates: { lat: 23.7925, lng: 90.4078 },
  createdAt: '2026-08-01T09:30:00.000Z',
};

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockSearchPlaces = jest.fn();

jest.mock('../api', () => ({
  listSavedPlaces: () => mockList(),
  createSavedPlace: (request: unknown) => mockCreate(request),
  deleteSavedPlace: (placeId: string) => mockDelete(placeId),
}));

/* The address picker is the booking one, and it talks to the geocoder. Mocked
   here so this spec is about saving a place rather than about search. */
jest.mock('../../booking/api', () => ({
  searchPlaces: (query: string) => mockSearchPlaces(query),
}));

function fullList(): { places: (typeof OFFICE)[] } {
  return {
    places: Array.from({ length: MAX_SAVED_PLACES }, (_, index) => ({
      ...OFFICE,
      id: `place-${String(index)}`,
      label: `Place ${String(index)}`,
    })),
  };
}

describe('SavedPlaces', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockCreate.mockReset();
    mockDelete.mockReset();
    mockSearchPlaces.mockReset();
    mockList.mockResolvedValue({ places: [] });
    mockCreate.mockResolvedValue(OFFICE);
    mockDelete.mockResolvedValue(undefined);
    mockSearchPlaces.mockResolvedValue([
      {
        id: 'geo-1',
        label: 'Gulshan Avenue, Dhaka',
        coordinates: OFFICE.coordinates,
      },
    ]);
  });

  it('says so when nothing is saved yet', async () => {
    renderWithProviders(<SavedPlaces />);

    expect(await screen.findByText(/nothing saved yet/iu)).toBeVisible();
  });

  it('lists what is saved, with the label and the address', async () => {
    mockList.mockResolvedValue({ places: [OFFICE] });

    renderWithProviders(<SavedPlaces />);

    expect(await screen.findByText('Office')).toBeVisible();
    expect(screen.getByText('Gulshan Avenue, Dhaka')).toBeVisible();
  });

  it('will not save until both a label and a place are given', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SavedPlaces />);

    const save = await screen.findByRole('button', { name: /save place/iu });

    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/what do you call it/iu), 'Office');

    /* A label with no coordinates is exactly the row that would be useless
       later, so the button stays disabled rather than saving something that
       cannot be routed from. */
    expect(save).toBeDisabled();
  });

  it('saves the picked coordinates, not the typed text', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SavedPlaces />);

    await user.type(
      await screen.findByLabelText(/what do you call it/iu),
      'Office',
    );
    await user.type(screen.getByLabelText(/which place/iu), 'gulshan');
    await user.click(await screen.findByRole('option', { name: /gulshan/iu }));
    await user.click(screen.getByRole('button', { name: /save place/iu }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        label: 'Office',
        address: 'Gulshan Avenue, Dhaka',
        coordinates: OFFICE.coordinates,
      });
    });
  });

  it('removes a place', async () => {
    mockList.mockResolvedValue({ places: [OFFICE] });

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SavedPlaces />);

    await user.click(await screen.findByRole('button', { name: /remove/iu }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('place-1');
    });
  });

  it('hides the form at the limit rather than failing on submit', async () => {
    mockList.mockResolvedValue(fullList());

    renderWithProviders(<SavedPlaces />);

    expect(
      await screen.findByText(/remove one to add another/iu),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /save place/iu }),
    ).not.toBeInTheDocument();
  });

  it('says so when saving fails', async () => {
    mockCreate.mockRejectedValue(new Error('Network unreachable.'));

    const user = userEvent.setup({ delay: null });
    renderWithProviders(<SavedPlaces />);

    await user.type(
      await screen.findByLabelText(/what do you call it/iu),
      'Office',
    );
    await user.type(screen.getByLabelText(/which place/iu), 'gulshan');
    await user.click(await screen.findByRole('option', { name: /gulshan/iu }));
    await user.click(screen.getByRole('button', { name: /save place/iu }));

    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
