import {
  type CreateVehicleInput,
  type VehicleRecord,
  type VehicleRepository,
} from '../modules/vehicles/vehicle-repository.port';
import {
  PlateAlreadyRegisteredError,
  VehicleNotFoundError,
} from '../modules/vehicles/vehicles.errors';

/**
 * In-memory {@link VehicleRepository}.
 *
 * Enforces global plate uniqueness and one active vehicle per driver, as the
 * database does. A fake that allowed either would let a unit test prove a
 * guarantee the system does not have.
 */
export class InMemoryVehicleRepository implements VehicleRepository {
  private readonly rows = new Map<string, VehicleRecord>();
  private sequence = 0;

  public async create(input: CreateVehicleInput): Promise<VehicleRecord> {
    const clash = [...this.rows.values()].some(
      (row) => row.plateNo === input.plateNo,
    );

    if (clash) throw new PlateAlreadyRegisteredError();

    this.sequence += 1;
    const record: VehicleRecord = {
      ...input,
      id: `vehicle_${this.sequence}`,
      createdAt: new Date(),
    };

    this.rows.set(record.id, record);
    return record;
  }

  public async listForDriver(
    driverProfileId: string,
  ): Promise<readonly VehicleRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.driverProfileId === driverProfileId)
      .sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );
  }

  public async findById(vehicleId: string): Promise<VehicleRecord | null> {
    return this.rows.get(vehicleId) ?? null;
  }

  public async findActiveForDriver(
    driverProfileId: string,
  ): Promise<VehicleRecord | null> {
    return (
      [...this.rows.values()].find(
        (row) => row.driverProfileId === driverProfileId && row.isActive,
      ) ?? null
    );
  }

  public async activate(
    vehicleId: string,
    driverProfileId: string,
  ): Promise<VehicleRecord> {
    const target = this.rows.get(vehicleId);

    if (target?.driverProfileId !== driverProfileId) {
      throw new VehicleNotFoundError(vehicleId);
    }

    for (const row of this.rows.values()) {
      if (row.driverProfileId === driverProfileId && row.isActive) {
        this.rows.set(row.id, { ...row, isActive: false });
      }
    }

    const activated = { ...target, isActive: true };
    this.rows.set(activated.id, activated);

    return activated;
  }

  public async remove(
    vehicleId: string,
    driverProfileId: string,
  ): Promise<boolean> {
    const target = this.rows.get(vehicleId);

    if (target?.driverProfileId !== driverProfileId) {
      return false;
    }

    this.rows.delete(vehicleId);
    return true;
  }
}
