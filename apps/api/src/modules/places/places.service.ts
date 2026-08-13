import {
  type CreateSavedPlaceRequest,
  MAX_SAVED_PLACES,
  type SavedPlace,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import {
  SavedPlaceNotFoundError,
  TooManySavedPlacesError,
} from './places.errors';
import {
  SAVED_PLACE_REPOSITORY,
  type SavedPlaceRecord,
  type SavedPlaceRepository,
} from './saved-place-repository.port';

/**
 * A rider's shortlist of addresses.
 *
 * Every method takes the owner's id and none takes one from a request body,
 * the same construction as settings: there is no way to express "read
 * somebody else's places", so there is no check to forget.
 */
@Injectable()
export class PlacesService {
  public constructor(
    @Inject(SAVED_PLACE_REPOSITORY)
    private readonly places: SavedPlaceRepository,
  ) {}

  public async list(userId: string): Promise<readonly SavedPlace[]> {
    return (await this.places.listForUser(userId)).map(toSavedPlace);
  }

  /**
   * Save one, if there is room.
   *
   * The count is read before the insert, which is a race in principle: two
   * simultaneous saves at the limit could both pass. That is deliberate.
   * Enforcing it exactly would mean a constraint or a lock, and the cost of
   * being wrong is one extra row on one rider's list — against which a
   * locked table on every save is a poor trade. The limit exists to stop
   * unbounded growth, not to be exactly twenty.
   */
  public async create(
    userId: string,
    request: CreateSavedPlaceRequest,
  ): Promise<SavedPlace> {
    if ((await this.places.countForUser(userId)) >= MAX_SAVED_PLACES) {
      throw new TooManySavedPlacesError();
    }

    return toSavedPlace(
      await this.places.create({
        userId,
        label: request.label,
        address: request.address,
        coordinates: request.coordinates,
      }),
    );
  }

  public async remove(userId: string, placeId: string): Promise<void> {
    const deleted = await this.places.delete(userId, placeId);

    if (!deleted) throw new SavedPlaceNotFoundError();
  }

  /** Used by search. Scoped to the caller like everything else here. */
  public async search(
    userId: string,
    query: string,
    limit: number,
  ): Promise<readonly SavedPlace[]> {
    return (await this.places.search(userId, query, limit)).map(toSavedPlace);
  }
}

function toSavedPlace(record: SavedPlaceRecord): SavedPlace {
  return {
    id: record.id,
    label: record.label,
    address: record.address,
    coordinates: record.coordinates,
    createdAt: record.createdAt.toISOString(),
  };
}
