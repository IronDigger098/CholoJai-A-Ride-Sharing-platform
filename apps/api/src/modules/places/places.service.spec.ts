import { MAX_SAVED_PLACES } from '@cholojai/shared';

import { InMemorySavedPlaceRepository } from '../../testing/in-memory-saved-place.repository';

import {
  SavedPlaceNotFoundError,
  TooManySavedPlacesError,
} from './places.errors';
import { PlacesService } from './places.service';

const RIDER = 'rider-1';
const OTHER = 'rider-2';

const GULSHAN = {
  label: 'Office',
  address: 'Gulshan Avenue, Dhaka',
  coordinates: { lat: 23.7925, lng: 90.4078 },
};

function makeService(): {
  service: PlacesService;
  places: InMemorySavedPlaceRepository;
} {
  const places = new InMemorySavedPlaceRepository();

  return { service: new PlacesService(places), places };
}

describe('PlacesService', () => {
  it('saves a place and lists it back', async () => {
    const { service } = makeService();

    const saved = await service.create(RIDER, GULSHAN);

    expect(saved.label).toBe('Office');
    expect(saved.coordinates).toEqual(GULSHAN.coordinates);
    expect(await service.list(RIDER)).toEqual([saved]);
  });

  it('keeps one rider out of another rider list', async () => {
    const { service } = makeService();

    await service.create(RIDER, GULSHAN);

    expect(await service.list(OTHER)).toEqual([]);
  });

  it('refuses to save past the limit', async () => {
    const { service } = makeService();

    for (let index = 0; index < MAX_SAVED_PLACES; index += 1) {
      await service.create(RIDER, {
        ...GULSHAN,
        label: `Place ${String(index)}`,
      });
    }

    await expect(service.create(RIDER, GULSHAN)).rejects.toThrow(
      TooManySavedPlacesError,
    );
  });

  it('counts the limit per rider, not globally', async () => {
    const { service } = makeService();

    for (let index = 0; index < MAX_SAVED_PLACES; index += 1) {
      await service.create(RIDER, {
        ...GULSHAN,
        label: `Place ${String(index)}`,
      });
    }

    /* The other rider starts from zero. A limit read with the wrong scope
       would lock out every account once any one account filled up. */
    await expect(service.create(OTHER, GULSHAN)).resolves.toBeDefined();
  });

  it('removes a place', async () => {
    const { service } = makeService();

    const saved = await service.create(RIDER, GULSHAN);
    await service.remove(RIDER, saved.id);

    expect(await service.list(RIDER)).toEqual([]);
  });

  it('answers not-found when the place belongs to someone else', async () => {
    const { service } = makeService();

    const saved = await service.create(RIDER, GULSHAN);

    /* Not-found rather than forbidden, deliberately: a probe that could tell
       "not yours" from "no such id" would learn which ids are real. */
    await expect(service.remove(OTHER, saved.id)).rejects.toThrow(
      SavedPlaceNotFoundError,
    );
    expect(await service.list(RIDER)).toHaveLength(1);
  });

  it('answers not-found for an id that never existed', async () => {
    const { service } = makeService();

    await expect(service.remove(RIDER, 'nope')).rejects.toThrow(
      SavedPlaceNotFoundError,
    );
  });

  it('searches labels and addresses, case-insensitively', async () => {
    const { service } = makeService();

    const office = await service.create(RIDER, GULSHAN);
    const home = await service.create(RIDER, {
      label: 'Home',
      address: 'Banani, Dhaka',
      coordinates: { lat: 23.7936, lng: 90.4066 },
    });

    /* A label hit and an address hit, from queries in the wrong case. */
    expect(await service.search(RIDER, 'OFFICE', 5)).toEqual([office]);
    expect(await service.search(RIDER, 'banani', 5)).toEqual([home]);
  });

  it('does not search another rider places', async () => {
    const { service } = makeService();

    await service.create(RIDER, GULSHAN);

    expect(await service.search(OTHER, 'gulshan', 5)).toEqual([]);
  });

  it('honours the search limit', async () => {
    const { service } = makeService();

    await service.create(RIDER, { ...GULSHAN, label: 'Office one' });
    await service.create(RIDER, { ...GULSHAN, label: 'Office two' });

    expect(await service.search(RIDER, 'office', 1)).toHaveLength(1);
  });
});
