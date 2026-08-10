import {
  type CreateVehicleRequest,
  type DriverApplicationRequest,
  type DriverProfile,
  driverProfileSchema,
  myDriverProfileSchema,
  type Ride,
  rideOffersSchema,
  rideSchema,
  type Vehicle,
  vehicleListSchema,
  vehicleSchema,
} from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

/** Driver calls. Every response is parsed against the shared contract. */

export async function applyToDrive(
  request: DriverApplicationRequest,
): Promise<DriverProfile> {
  const response = await apiClient.post('/drivers/applications', request);
  return driverProfileSchema.parse(response.data);
}

export async function getMyDriverProfile(): Promise<DriverProfile | null> {
  const response = await apiClient.get('/drivers/me');
  return myDriverProfileSchema.parse(response.data).profile;
}

export async function listVehicles(): Promise<readonly Vehicle[]> {
  const response = await apiClient.get('/vehicles');
  return vehicleListSchema.parse(response.data).vehicles;
}

export async function createVehicle(
  request: CreateVehicleRequest,
): Promise<Vehicle> {
  const response = await apiClient.post('/vehicles', request);
  return vehicleSchema.parse(response.data);
}

export async function activateVehicle(vehicleId: string): Promise<Vehicle> {
  const response = await apiClient.patch(`/vehicles/${vehicleId}/activate`);
  return vehicleSchema.parse(response.data);
}

export async function removeVehicle(vehicleId: string): Promise<void> {
  await apiClient.delete(`/vehicles/${vehicleId}`);
}

export async function listOffers(): Promise<readonly Ride[]> {
  const response = await apiClient.get('/rides/offers');
  return rideOffersSchema.parse(response.data).offers;
}

/** accept / arrive / start / complete — one arrow of the state machine each. */
export async function driverAction(
  rideId: string,
  action: 'accept' | 'arrive' | 'start' | 'complete',
): Promise<Ride> {
  const response = await apiClient.post(`/rides/${rideId}/${action}`, {});
  return rideSchema.parse(response.data);
}
