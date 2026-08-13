import {
  type CreateSavedPlaceRequest,
  type SavedPlace,
  type SavedPlaceList,
  savedPlaceListSchema,
  savedPlaceSchema,
} from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

/** Saved-place calls. Every response is parsed against the shared contract. */

export async function listSavedPlaces(): Promise<SavedPlaceList> {
  const response = await apiClient.get('/places');

  return savedPlaceListSchema.parse(response.data);
}

export async function createSavedPlace(
  request: CreateSavedPlaceRequest,
): Promise<SavedPlace> {
  const response = await apiClient.post('/places', request);

  return savedPlaceSchema.parse(response.data);
}

export async function deleteSavedPlace(placeId: string): Promise<void> {
  await apiClient.delete(`/places/${placeId}`);
}
