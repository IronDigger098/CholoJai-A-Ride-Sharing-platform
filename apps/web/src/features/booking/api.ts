import {
  type BookRideRequest,
  type FareQuoteRequest,
  type FareQuoteResponse,
  fareQuoteResponseSchema,
  type Place,
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
