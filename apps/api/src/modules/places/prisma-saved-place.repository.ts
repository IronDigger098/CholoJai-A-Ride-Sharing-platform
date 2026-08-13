import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateSavedPlaceInput,
  type SavedPlaceRecord,
  type SavedPlaceRepository,
} from './saved-place-repository.port';

/** Shape of the row this adapter reads. */
interface SavedPlaceRow {
  id: string;
  userId: string;
  label: string;
  address: string;
  lat: unknown;
  lng: unknown;
  createdAt: Date;
}

/** PostgreSQL adapter for {@link SavedPlaceRepository}. */
@Injectable()
export class PrismaSavedPlaceRepository implements SavedPlaceRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateSavedPlaceInput): Promise<SavedPlaceRecord> {
    const row: SavedPlaceRow = await this.prisma.savedPlace.create({
      data: {
        userId: input.userId,
        label: input.label,
        address: input.address,
        lat: input.coordinates.lat,
        lng: input.coordinates.lng,
      },
    });

    return toRecord(row);
  }

  public async listForUser(
    userId: string,
  ): Promise<readonly SavedPlaceRecord[]> {
    const rows: SavedPlaceRow[] = await this.prisma.savedPlace.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  public async countForUser(userId: string): Promise<number> {
    return this.prisma.savedPlace.count({ where: { userId } });
  }

  /**
   * `deleteMany` with the owner in the WHERE clause.
   *
   * One statement rather than read-then-delete: the ownership check and the
   * write cannot disagree if they are the same statement, and `deleteMany`
   * answers zero for a missing row instead of throwing the way `delete`
   * does. Both "no such place" and "not yours" come back as false.
   */
  public async delete(userId: string, placeId: string): Promise<boolean> {
    const deleted = await this.prisma.savedPlace.deleteMany({
      where: { id: placeId, userId },
    });

    return deleted.count > 0;
  }

  public async search(
    userId: string,
    query: string,
    limit: number,
  ): Promise<readonly SavedPlaceRecord[]> {
    const rows: SavedPlaceRow[] = await this.prisma.savedPlace.findMany({
      where: {
        userId,
        OR: [
          { label: { contains: query, mode: 'insensitive' } },
          { address: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.map(toRecord);
  }
}

/**
 * Prisma returns `Decimal` for the coordinate columns.
 *
 * `Decimal` exists to keep money exact; a latitude at six decimal places is
 * exact enough as a float and is what every consumer wants. Converted here
 * rather than leaking the driver's type past the repository boundary — the
 * same reasoning as the fare-quote adapter.
 */
function toRecord(row: SavedPlaceRow): SavedPlaceRecord {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    address: row.address,
    coordinates: { lat: Number(row.lat), lng: Number(row.lng) },
    createdAt: row.createdAt,
  };
}
