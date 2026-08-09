import {
  ACTIVE_RIDE_STATUSES,
  type RideStatus,
  type VehicleType,
} from '@cholojai/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateRideInput,
  type RideRecord,
  type RideRepository,
} from './ride-repository.port';
import { RiderAlreadyOnRideError } from './rides.errors';

/** Shape of the row this adapter reads. */
interface RideRow {
  id: string;
  riderId: string;
  fareQuoteId: string;
  status: string;
  vehicleType: string;
  pickupLat: unknown;
  pickupLng: unknown;
  pickupAddress: string;
  dropoffLat: unknown;
  dropoffLng: unknown;
  dropoffAddress: string;
  distanceM: number;
  durationS: number;
  fareBasePaisa: number;
  fareDistancePaisa: number;
  fareTimePaisa: number;
  fareDiscountPaisa: number;
  fareTotalPaisa: number;
  requestedAt: Date;
}

/** PostgreSQL adapter for {@link RideRepository}. */
@Injectable()
export class PrismaRideRepository implements RideRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateRideInput): Promise<RideRecord> {
    try {
      const row: RideRow = await this.prisma.ride.create({
        data: {
          riderId: input.riderId,
          fareQuoteId: input.fareQuoteId,
          vehicleType: input.vehicleType,
          pickupLat: input.pickup.lat,
          pickupLng: input.pickup.lng,
          pickupAddress: input.pickupAddress,
          dropoffLat: input.dropoff.lat,
          dropoffLng: input.dropoff.lng,
          dropoffAddress: input.dropoffAddress,
          distanceM: input.distanceMetres,
          durationS: input.durationSeconds,
          fareBasePaisa: input.fare.base,
          fareDistancePaisa: input.fare.distance,
          fareTimePaisa: input.fare.time,
          fareDiscountPaisa: input.fare.discount,
          fareTotalPaisa: input.fare.total,
        },
      });

      return toRecord(row);
    } catch (error) {
      /* The partial unique index firing, not a bug. Two booking requests
         arriving together both pass any check this service could make;
         exactly one of them reaches this line. Translating here keeps the
         race handled where the database resolved it, rather than in a
         service that cannot see it. */
      if (isUniqueViolation(error, 'one_active_ride_per_rider')) {
        throw new RiderAlreadyOnRideError();
      }
      throw error;
    }
  }

  public async findActiveForRider(riderId: string): Promise<RideRecord | null> {
    const row: RideRow | null = await this.prisma.ride.findFirst({
      where: { riderId, status: { in: [...ACTIVE_RIDE_STATUSES] } },
    });

    return row === null ? null : toRecord(row);
  }
}

/**
 * Was this a violation of one specific index?
 *
 * Checked by name rather than by "some unique constraint failed". `rides`
 * has two partial unique indexes, and reporting "you are already on a ride"
 * because the *driver* index fired would be a confidently wrong answer.
 */
function isUniqueViolation(error: unknown, indexName: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  /* Prisma reports the constraint under `meta.target`, as a string for a
     named index and an array of columns otherwise. */
  const target = error.meta?.['target'];

  return typeof target === 'string'
    ? target === indexName
    : Array.isArray(target) && target.includes(indexName);
}

function toRecord(row: RideRow): RideRecord {
  return {
    id: row.id,
    riderId: row.riderId,
    fareQuoteId: row.fareQuoteId,
    status: row.status as RideStatus,
    vehicleType: row.vehicleType as VehicleType,
    pickup: { lat: Number(row.pickupLat), lng: Number(row.pickupLng) },
    pickupAddress: row.pickupAddress,
    dropoff: { lat: Number(row.dropoffLat), lng: Number(row.dropoffLng) },
    dropoffAddress: row.dropoffAddress,
    distanceMetres: row.distanceM,
    durationSeconds: row.durationS,
    fare: {
      base: row.fareBasePaisa,
      distance: row.fareDistancePaisa,
      time: row.fareTimePaisa,
      discount: row.fareDiscountPaisa,
      total: row.fareTotalPaisa,
    },
    requestedAt: row.requestedAt,
  };
}
