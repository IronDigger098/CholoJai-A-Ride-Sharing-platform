import { randomUUID } from 'node:crypto';

import {
  type CreateSavedPlaceInput,
  type SavedPlaceRecord,
  type SavedPlaceRepository,
} from '../modules/places/saved-place-repository.port';

/**
 * In-memory {@link SavedPlaceRepository}.
 *
 * Oldest first, matching the adapter, and `search` lower-cases both sides
 * because the adapter passes `mode: 'insensitive'` — the fake must be as
 * permissive as the database, never more strict, or a unit test can prove a
 * guarantee the system does not have.
 */
export class InMemorySavedPlaceRepository implements SavedPlaceRepository {
  private readonly rows: SavedPlaceRecord[] = [];

  public async create(input: CreateSavedPlaceInput): Promise<SavedPlaceRecord> {
    const record: SavedPlaceRecord = {
      id: randomUUID(),
      userId: input.userId,
      label: input.label,
      address: input.address,
      coordinates: input.coordinates,
      createdAt: new Date(),
    };

    this.rows.push(record);

    return record;
  }

  public async listForUser(
    userId: string,
  ): Promise<readonly SavedPlaceRecord[]> {
    /* Insertion order is creation order here, so no sort is needed — and
       none is honest to add, because rows created inside one test share a
       millisecond and sorting on `createdAt` would not be a total order. */
    return this.rows.filter((row) => row.userId === userId);
  }

  public async countForUser(userId: string): Promise<number> {
    return this.rows.filter((row) => row.userId === userId).length;
  }

  public async delete(userId: string, placeId: string): Promise<boolean> {
    const index = this.rows.findIndex(
      (row) => row.id === placeId && row.userId === userId,
    );

    if (index === -1) return false;

    this.rows.splice(index, 1);

    return true;
  }

  public async search(
    userId: string,
    query: string,
    limit: number,
  ): Promise<readonly SavedPlaceRecord[]> {
    const needle = query.toLowerCase();

    return this.rows
      .filter(
        (row) =>
          row.userId === userId &&
          (row.label.toLowerCase().includes(needle) ||
            row.address.toLowerCase().includes(needle)),
      )
      .slice(0, limit);
  }
}
