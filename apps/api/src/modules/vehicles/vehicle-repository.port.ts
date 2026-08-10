import { type VehicleType } from '@cholojai/shared';

export interface VehicleRecord {
  readonly id: string;
  readonly driverProfileId: string;
  readonly type: VehicleType;
  readonly make: string;
  readonly model: string;
  readonly plateNo: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export interface CreateVehicleInput {
  readonly driverProfileId: string;
  readonly type: VehicleType;
  readonly make: string;
  readonly model: string;
  readonly plateNo: string;
  /** Only ever true when the driver has no other active vehicle. */
  readonly isActive: boolean;
}

export interface VehicleRepository {
  /** Throws `PlateAlreadyRegisteredError` — `plate_no` is globally unique. */
  create(input: CreateVehicleInput): Promise<VehicleRecord>;

  listForDriver(driverProfileId: string): Promise<readonly VehicleRecord[]>;

  findById(vehicleId: string): Promise<VehicleRecord | null>;

  findActiveForDriver(driverProfileId: string): Promise<VehicleRecord | null>;

  /**
   * Make one vehicle the driver's active one, in a single transaction.
   *
   * `one_active_vehicle_per_driver` is a partial unique index, so
   * deactivating the current vehicle and activating the new one cannot be
   * two statements with a gap: between them the driver would briefly have
   * none, and if the second failed they would have none permanently. The
   * transaction is what makes the swap atomic — and it must deactivate
   * before it activates, or the index rejects the write outright.
   */
  activate(vehicleId: string, driverProfileId: string): Promise<VehicleRecord>;

  /** Returns false when the vehicle did not belong to this driver. */
  remove(vehicleId: string, driverProfileId: string): Promise<boolean>;
}

export const VEHICLE_REPOSITORY = Symbol('VEHICLE_REPOSITORY');
