import {
  activeRideResponseSchema,
  type RideListQuery,
  type RidePage,
  ridePageSchema,
  type Ride,
  rideSchema,
} from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

export async function listRides(query: RideListQuery): Promise<RidePage> {
  const response = await apiClient.get('/rides', { params: query });
  return ridePageSchema.parse(response.data);
}

/**
 * The ride the caller is currently on, in whichever capacity.
 *
 * The API answers for rider and driver alike, so both dashboards read the
 * same endpoint rather than each having their own idea of "current".
 */
export async function getActiveRide(): Promise<Ride | null> {
  const response = await apiClient.get('/rides/active');
  return activeRideResponseSchema.parse(response.data).ride;
}

export async function getRide(rideId: string): Promise<Ride> {
  const response = await apiClient.get(`/rides/${rideId}`);
  return rideSchema.parse(response.data);
}

export async function cancelRide(rideId: string): Promise<Ride> {
  const response = await apiClient.post(`/rides/${rideId}/cancel`, {});
  return rideSchema.parse(response.data);
}
