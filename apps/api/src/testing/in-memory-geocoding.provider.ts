import { type Coordinates, type Place } from '@cholojai/shared';

import { type GeocodingProvider } from '../modules/geo/geocoding.port';

/**
 * In-memory {@link GeocodingProvider}.
 *
 * Substring matching, which is not what a real geocoder does — Nominatim
 * ranks, tolerates misspellings, and understands that "Banani 11" is a place
 * rather than two words. Nothing here should be read as evidence that search
 * *works*; it exists so tests of caching and wiring do not reach the
 * network.
 */
export class InMemoryGeocodingProvider implements GeocodingProvider {
  public constructor(private readonly places: readonly Place[] = []) {}

  public searchCalls = 0;
  public reverseCalls = 0;

  public async search(query: string): Promise<readonly Place[]> {
    this.searchCalls += 1;

    const needle = query.trim().toLowerCase();
    return this.places.filter((place) =>
      place.label.toLowerCase().includes(needle),
    );
  }

  public async reverse(point: Coordinates): Promise<Place | null> {
    this.reverseCalls += 1;

    /* Nearest by squared distance — no need for a real metric when the
       fixtures are a handful of points and the assertion is "which one". */
    const nearest = [...this.places].sort(
      (a, b) => distance(a, point) - distance(b, point),
    )[0];

    return nearest ?? null;
  }
}

function distance(place: Place, point: Coordinates): number {
  return (
    (place.coordinates.lat - point.lat) ** 2 +
    (place.coordinates.lng - point.lng) ** 2
  );
}
