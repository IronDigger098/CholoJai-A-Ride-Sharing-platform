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
  type TransitionRideInput,
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
      if (isUniqueViolation(error, 'rider_id')) {
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

  public async findById(rideId: string): Promise<RideRecord | null> {
    const row: RideRow | null = await this.prisma.ride.findUnique({
      where: { id: rideId },
    });

    return row === null ? null : toRecord(row);
  }

  public async transition(input: TransitionRideInput): Promise<boolean> {
    /* `updateMany` rather than `update`, because only `updateMany` accepts a
       non-unique WHERE — and `status` in the WHERE is what makes this one
       atomic statement instead of a check followed by a write. `update`
       would need the id alone and would happily move a ride that had
       already left `from`. */
    /* Spread rather than an inline computed key: a computed key widens the
       literal to `{ [x: string]: Date }`, which is not assignable to
       Prisma's update input, while a spread is exempt from excess-property
       checking and keeps the rest of the object precisely typed. */
    const stamp = { [TIMESTAMP_COLUMN[input.to]]: input.at };

    const result = await this.prisma.ride.updateMany({
      where: { id: input.rideId, status: input.from },
      data: {
        status: input.to,
        ...stamp,
        ...(input.cancelledBy === undefined
          ? {}
          : { cancelledBy: input.cancelledBy }),
        ...(input.cancelReason === undefined
          ? {}
          : { cancelReason: input.cancelReason }),
      },
    });

    return result.count === 1;
  }
}

/**
 * Which timestamp each status writes.
 *
 * The audit trail *is* this set of columns (schema.prisma) — pickup wait and
 * journey duration fall out of them for free. Recorded as a map so adding a
 * status to `RideStatus` without deciding what it stamps is a compile error
 * rather than a column that silently stays null.
 *
 * Two entries exist only to make the record total, and both are worth
 * naming. Nothing transitions *into* `REQUESTED` — the table in
 * `ride-status.ts` has no arrow pointing at it — so its column is the one
 * the row already carries by default.
 *
 * `EXPIRED` writes `cancelledAt`, which is a compromise rather than a
 * design: the schema has no `expiredAt`, and the honest reading of
 * `cancelledAt` is "the moment this ride ended without completing", which
 * covers both. It is distinguishable because `cancelledBy` stays null for an
 * expiry, where a real cancellation always records RIDER, DRIVER or SYSTEM
 * (D3). If expiry reporting ever needs its own column, that is a migration
 * and this map is the one place that changes.
 */
const TIMESTAMP_COLUMN = {
  REQUESTED: 'requestedAt',
  ACCEPTED: 'acceptedAt',
  ARRIVED: 'arrivedAt',
  IN_PROGRESS: 'startedAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
  EXPIRED: 'cancelledAt',
} as const satisfies Readonly<Record<RideStatus, string>>;

/**
 * Was this a violation of one specific unique index?
 *
 * Matched on the column the index covers, not on "some unique constraint
 * failed". `rides` carries two partial unique indexes, and reporting "you
 * are already on a ride" because the *driver* index fired would be a
 * confidently wrong answer.
 *
 * The column rather than the index name, because that is what Prisma
 * actually reports — observed, not assumed. For a violation of
 * `one_active_ride_per_rider` it puts `['rider_id']` in `meta.target` and
 * says "Unique constraint failed on the fields: (`rider_id`)". Note the
 * *database* column, `rider_id`, not the Prisma field `riderId`. An earlier
 * version of this matched the index name, which meant the translation never
 * fired and a rider booking twice received an unhandled Prisma error;
 * `prisma-ride.repository.int-spec.ts` is what caught it.
 *
 * Matching by column stays precise here because the two indexes cover
 * different columns — `rider_id` and `driver_profile_id`. If a future index
 * ever covered `rider_id` as well, this would need the constraint name back,
 * and the integration test is what would tell us.
 */
function isUniqueViolation(error: unknown, column: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  const target = error.meta?.['target'];

  return typeof target === 'string'
    ? target === column
    : Array.isArray(target) && target.includes(column);
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
