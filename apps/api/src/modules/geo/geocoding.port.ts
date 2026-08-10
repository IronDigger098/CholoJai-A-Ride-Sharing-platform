import { type Coordinates, type Place } from '@cholojai/shared';

/**
 * What the application needs from a geocoder.
 *
 * Separate from `RoutingProvider` rather than folded into one "geo
 * provider". They answer different questions, they will plausibly be served
 * by different vendors — Nominatim geocodes well and does not route — and a
 * single interface would force every implementation to supply both.
 */
export interface GeocodingProvider {
  /** Free-text search. Returns an empty list when nothing matches. */
  search(query: string): Promise<readonly Place[]>;

  /** The place at a point, or null when there is nothing there. */
  reverse(point: Coordinates): Promise<Place | null>;
}

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');
