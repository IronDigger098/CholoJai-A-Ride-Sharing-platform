import {
  type BookRideRequest,
  type Coordinates,
  type FareQuoteRequest,
  type FareQuoteResponse,
  fareQuoteResponseSchema,
  type Place,
  reverseGeocodeResponseSchema,
  type Ride,
  rideSchema,
  searchPlacesResponseSchema,
} from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

/** Booking calls. Every response is parsed against the shared contract. */

export async function searchPlaces(query: string): Promise<readonly Place[]> {
  const response = await apiClient.get('/geo/search', { params: { q: query } });
  return searchPlacesResponseSchema.parse(response.data).places;
}

/**
 * The place at a dropped pin.
 *
 * Returns null where there is no address — open water, the middle of a
 * field. The caller decides what to do about it; there is nothing wrong
 * with the request.
 */
export async function reverseGeocode(
  point: Coordinates,
): Promise<Place | null> {
  const response = await apiClient.get('/geo/reverse', { params: point });
  return reverseGeocodeResponseSchema.parse(response.data).place;
}

export async function requestQuote(
  request: FareQuoteRequest,
): Promise<FareQuoteResponse> {
  const response = await apiClient.post('/fares/quote', request);
  return fareQuoteResponseSchema.parse(response.data);
}

export async function bookRide(request: BookRideRequest): Promise<Ride> {
  const response = await apiClient.post('/rides', request);
  return rideSchema.parse(response.data);
}
