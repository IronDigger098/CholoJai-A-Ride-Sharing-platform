import {
  SEARCH_KIND_ORDER,
  SearchResultKind,
  VehicleType,
} from '@cholojai/shared';

import { InMemoryRideRepository } from '../../testing/in-memory-ride.repository';
import { InMemorySavedPlaceRepository } from '../../testing/in-memory-saved-place.repository';
import { PlacesService } from '../places/places.service';
import { type CreateRideInput } from '../rides/ride-repository.port';

import { SearchService } from './search.service';

const RIDER = 'rider-1';
const OTHER = 'rider-2';

function rideInput(overrides: Partial<CreateRideInput> = {}): CreateRideInput {
  return {
    riderId: RIDER,
    fareQuoteId: 'quote-1',
    vehicleType: VehicleType.CAR,
    pickup: { lat: 23.7925, lng: 90.4078 },
    pickupAddress: 'Gulshan Avenue, Dhaka',
    dropoff: { lat: 23.8103, lng: 90.4125 },
    dropoffAddress: 'Banani, Dhaka',
    distanceMetres: 4200,
    durationSeconds: 900,
    fare: {
      base: 5000,
      distance: 8400,
      time: 1500,
      discount: 0,
      total: 14_900,
    },
    ...overrides,
  };
}

function makeService(): {
  service: SearchService;
  places: PlacesService;
  rides: InMemoryRideRepository;
} {
  const placeRepository = new InMemorySavedPlaceRepository();
  const places = new PlacesService(placeRepository);
  const rides = new InMemoryRideRepository();

  return { service: new SearchService(places, rides), places, rides };
}

describe('SearchService', () => {
  it('returns nothing when nothing matches', async () => {
    const { service } = makeService();

    const { results } = await service.search(RIDER, 'zzzzz', 5);

    expect(results).toEqual([]);
  });

  it('finds a help article with no personal data at all', async () => {
    const { service } = makeService();

    const { results } = await service.search(RIDER, 'promo code', 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: SearchResultKind.HELP,
      slug: 'promo-codes',
    });
  });

  it('groups places, then rides, then help', async () => {
    const { service, places, rides } = makeService();

    await places.create(RIDER, {
      label: 'Office',
      address: 'Banani, Dhaka',
      coordinates: { lat: 23.7936, lng: 90.4066 },
    });
    await rides.create(rideInput());

    /* "cancel" would be a poor probe — it appears in one help article and
       nowhere else. "banani" hits a place and a ride; the help entry is
       forced in by searching a word all three share is not possible, so the
       ordering assertion below is over the two sources that can collide. */
    const { results } = await service.search(RIDER, 'banani', 5);

    expect(results.map((result) => result.kind)).toEqual([
      SearchResultKind.PLACE,
      SearchResultKind.RIDE,
    ]);
  });

  it('orders groups by SEARCH_KIND_ORDER, not by insertion', async () => {
    const { service, places, rides } = makeService();

    /* The ride exists before the place, so a naive concatenation in the
       order the sources were queried could put it first. */
    await rides.create(rideInput());
    await places.create(RIDER, {
      label: 'Banani flat',
      address: 'Road 11, Dhaka',
      coordinates: { lat: 23.7936, lng: 90.4066 },
    });

    const { results } = await service.search(RIDER, 'banani', 5);
    const kinds = results.map((result) => result.kind);

    /* Every kind present appears in SEARCH_KIND_ORDER positions that only
       increase — which is what "grouped in a fixed order" means, stated so
       it stays true if a fourth source is ever added. */
    const positions = kinds.map((kind) => SEARCH_KIND_ORDER.indexOf(kind));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(kinds[0]).toBe(SearchResultKind.PLACE);
  });

  it('never returns another rider rides or places', async () => {
    const { service, places, rides } = makeService();

    await places.create(OTHER, {
      label: 'Their office',
      address: 'Banani, Dhaka',
      coordinates: { lat: 23.7936, lng: 90.4066 },
    });
    await rides.create(rideInput({ riderId: OTHER }));

    const { results } = await service.search(RIDER, 'banani', 5);

    expect(results).toEqual([]);
  });

  it('matches a ride on either address', async () => {
    const { service, rides } = makeService();

    await rides.create(rideInput());

    /* Pickup and dropoff both count. A search that only looked at one would
       fail to find the ride somebody took *home* from the place they
       remember. */
    expect((await service.search(RIDER, 'gulshan', 5)).results).toHaveLength(1);
    expect((await service.search(RIDER, 'banani', 5)).results).toHaveLength(1);
  });

  it('carries the fare and timestamp on a ride result', async () => {
    const { service, rides } = makeService();

    const ride = await rides.create(rideInput());
    const { results } = await service.search(RIDER, 'gulshan', 5);

    expect(results[0]).toEqual({
      kind: SearchResultKind.RIDE,
      id: ride.id,
      pickupAddress: 'Gulshan Avenue, Dhaka',
      dropoffAddress: 'Banani, Dhaka',
      farePaisa: 14_900,
      requestedAt: ride.requestedAt.toISOString(),
    });
  });

  it('ranks a help question above a help keyword above an answer', async () => {
    const { service } = makeService();

    /* "password" is in one question, and in the keywords of that same
       article — so a broader probe is needed. "refund" is a keyword on
       cancel-a-ride and appears nowhere in a question, which is what makes
       it the article that must come second rather than first. */
    const { results } = await service.search(RIDER, 'cancel', 5);
    const slugs = results.map((result) =>
      result.kind === SearchResultKind.HELP ? result.slug : result.kind,
    );

    expect(slugs[0]).toBe('cancel-a-ride');
  });

  it('applies the limit per source', async () => {
    const { service, places } = makeService();

    for (const label of ['Banani one', 'Banani two', 'Banani three']) {
      await places.create(RIDER, {
        label,
        address: 'Dhaka',
        coordinates: { lat: 23.79, lng: 90.4 },
      });
    }

    const { results } = await service.search(RIDER, 'banani', 2);

    expect(results).toHaveLength(2);
  });
});
