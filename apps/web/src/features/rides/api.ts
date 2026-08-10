import { type Ride, rideSchema } from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

export async function getRide(rideId: string): Promise<Ride> {
  const response = await apiClient.get(`/rides/${rideId}`);
  return rideSchema.parse(response.data);
}

export async function cancelRide(rideId: string): Promise<Ride> {
  const response = await apiClient.post(`/rides/${rideId}/cancel`, {});
  return rideSchema.parse(response.data);
}
