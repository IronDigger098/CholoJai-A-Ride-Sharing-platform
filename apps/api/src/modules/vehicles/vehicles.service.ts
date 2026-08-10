import { type CreateVehicleRequest, type Vehicle } from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import { DriversService } from '../drivers/drivers.service';

import {
  VEHICLE_REPOSITORY,
  type VehicleRecord,
  type VehicleRepository,
} from './vehicle-repository.port';
import { VehicleNotFoundError } from './vehicles.errors';

/**
 * A driver's vehicles.
 *
 * Every method resolves the caller to an approved driver profile first. The
 * DRIVER role in a token is not enough — see
 * `DriversService.requireApprovedProfileId`.
 */
@Injectable()
export class VehiclesService {
  public constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicles: VehicleRepository,
    private readonly drivers: DriversService,
  ) {}

  /**
   * Register a vehicle.
   *
   * The first one a driver adds becomes active; later ones do not. Silently
   * switching the active vehicle on registration would change which vehicle
   * a driver is about to be dispatched in, as a side effect of adding a
   * second — `activate` exists to make that an explicit act.
   */
  public async create(
    userId: string,
    request: CreateVehicleRequest,
  ): Promise<Vehicle> {
    const driverProfileId = await this.drivers.requireApprovedProfileId(userId);

    const active = await this.vehicles.findActiveForDriver(driverProfileId);

    const vehicle = await this.vehicles.create({
      driverProfileId,
      type: request.type,
      make: request.make,
      model: request.model,
      plateNo: request.plateNo,
      isActive: active === null,
    });

    return toVehicle(vehicle);
  }

  public async list(userId: string): Promise<readonly Vehicle[]> {
    const driverProfileId = await this.drivers.requireApprovedProfileId(userId);

    return (await this.vehicles.listForDriver(driverProfileId)).map(toVehicle);
  }

  public async activate(userId: string, vehicleId: string): Promise<Vehicle> {
    const driverProfileId = await this.drivers.requireApprovedProfileId(userId);

    /* Ownership is checked by the repository's WHERE clause rather than by a
       read here — a read-then-write would let a vehicle change hands in the
       gap, and the answer is the same either way. */
    return toVehicle(await this.vehicles.activate(vehicleId, driverProfileId));
  }

  public async remove(userId: string, vehicleId: string): Promise<void> {
    const driverProfileId = await this.drivers.requireApprovedProfileId(userId);

    const removed = await this.vehicles.remove(vehicleId, driverProfileId);

    if (!removed) throw new VehicleNotFoundError(vehicleId);
  }
}

function toVehicle(record: VehicleRecord): Vehicle {
  return {
    id: record.id,
    type: record.type,
    make: record.make,
    model: record.model,
    plateNo: record.plateNo,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
  };
}
