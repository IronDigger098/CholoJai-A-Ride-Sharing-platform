import { type VehicleType } from '@cholojai/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateVehicleInput,
  type VehicleRecord,
  type VehicleRepository,
} from './vehicle-repository.port';
import {
  PlateAlreadyRegisteredError,
  VehicleInUseError,
  VehicleNotFoundError,
} from './vehicles.errors';

/** Shape of the row this adapter reads. */
interface VehicleRow {
  id: string;
  driverProfileId: string;
  type: string;
  make: string;
  model: string;
  plateNo: string;
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class PrismaVehicleRepository implements VehicleRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async create(input: CreateVehicleInput): Promise<VehicleRecord> {
    try {
      const row: VehicleRow = await this.prisma.vehicle.create({
        data: {
          driverProfileId: input.driverProfileId,
          type: input.type,
          make: input.make,
          model: input.model,
          plateNo: input.plateNo,
          isActive: input.isActive,
        },
      });

      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error, 'plate_no')) {
        throw new PlateAlreadyRegisteredError();
      }
      throw error;
    }
  }

  public async listForDriver(
    driverProfileId: string,
  ): Promise<readonly VehicleRecord[]> {
    const rows: VehicleRow[] = await this.prisma.vehicle.findMany({
      where: { driverProfileId },
      /* Active first, then newest. The one the driver is using is the one
         they are most likely looking for. */
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(toRecord);
  }

  public async findById(vehicleId: string): Promise<VehicleRecord | null> {
    const row: VehicleRow | null = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    return row === null ? null : toRecord(row);
  }

  public async findActiveForDriver(
    driverProfileId: string,
  ): Promise<VehicleRecord | null> {
    const row: VehicleRow | null = await this.prisma.vehicle.findFirst({
      where: { driverProfileId, isActive: true },
    });

    return row === null ? null : toRecord(row);
  }

  public async activate(
    vehicleId: string,
    driverProfileId: string,
  ): Promise<VehicleRecord> {
    /* Deactivate then activate, inside one transaction. The order is forced
       by `one_active_vehicle_per_driver`: activating first would mean two
       active rows for an instant, which the index rejects outright. The
       transaction is what stops a failure between the two leaving the
       driver with no active vehicle at all. */
    const row: VehicleRow = await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.updateMany({
        where: { driverProfileId, isActive: true },
        data: { isActive: false },
      });

      const updated = await tx.vehicle.updateMany({
        where: { id: vehicleId, driverProfileId },
        data: { isActive: true },
      });

      if (updated.count !== 1) throw new VehicleNotFoundError(vehicleId);

      return tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    });

    return toRecord(row);
  }

  public async remove(
    vehicleId: string,
    driverProfileId: string,
  ): Promise<boolean> {
    try {
      const result = await this.prisma.vehicle.deleteMany({
        where: { id: vehicleId, driverProfileId },
      });

      return result.count === 1;
    } catch (error) {
      /* `rides.vehicle_id` is onDelete: Restrict, so a vehicle attached to
         any ride cannot be deleted — which is correct: a completed ride
         must keep saying which vehicle carried it. */
      if (isForeignKeyViolation(error)) throw new VehicleInUseError();
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown, column: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;

  const target = error.meta?.['target'];

  return typeof target === 'string'
    ? target === column
    : Array.isArray(target) && target.includes(column);
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
}

function toRecord(row: VehicleRow): VehicleRecord {
  return {
    id: row.id,
    driverProfileId: row.driverProfileId,
    type: row.type as VehicleType,
    make: row.make,
    model: row.model,
    plateNo: row.plateNo,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}
