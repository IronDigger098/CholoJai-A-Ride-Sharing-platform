import { type Coordinates } from '@cholojai/shared';

/** What the places feature needs from persistence. */

export interface SavedPlaceRecord {
  readonly id: string;
  readonly userId: string;
  readonly label: string;
  readonly address: string;
  readonly coordinates: Coordinates;
  readonly createdAt: Date;
}

export interface CreateSavedPlaceInput {
  readonly userId: string;
  readonly label: string;
  readonly address: string;
  readonly coordinates: Coordinates;
}

export interface SavedPlaceRepository {
  create(input: CreateSavedPlaceInput): Promise<SavedPlaceRecord>;

  /** Everything this rider saved, oldest first — the order they built it. */
  listForUser(userId: string): Promise<readonly SavedPlaceRecord[]>;

  countForUser(userId: string): Promise<number>;

  /**
   * Delete one, scoped to its owner.
   *
   * The user id is a parameter rather than something checked by the caller
   * beforehand: a read-then-delete could act on a row that changed hands in
   * between, and more practically, an ownership check somewhere else is one
   * a future caller can skip. Returns false when nothing matched, which
   * covers both "no such place" and "not yours" — deliberately the same
   * answer, so a probe cannot tell them apart.
   */
  delete(userId: string, placeId: string): Promise<boolean>;

  /**
   * Places whose label or address contains `query`, case-insensitively.
   *
   * `contains` rather than a prefix match or a text-search index. A rider
   * looking for "Ma's place" may type "ma" or "place", and this table is
   * small enough per user that the scan is free. When it stops being free,
   * the honest fix is an index rather than a narrower match.
   */
  search(
    userId: string,
    query: string,
    limit: number,
  ): Promise<readonly SavedPlaceRecord[]>;
}

export const SAVED_PLACE_REPOSITORY = Symbol('SAVED_PLACE_REPOSITORY');
