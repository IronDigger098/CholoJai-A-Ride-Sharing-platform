import { isActiveRideStatus, RideStatus } from '@cholojai/shared';

import {
  type CreateRideInput,
  type RideRecord,
  type RideRepository,
} from '../modules/rides/ride-repository.port';
import { RiderAlreadyOnRideError } from '../modules/rides/rides.errors';

/**
 * In-memory {@link RideRepository}.
 *
 * The scan in `create` is not decoration. `one_active_ride_per_rider` is the
 * real guarantee, and a fake that let a rider hold two active rides would
 * make every unit test agree with a system that behaves differently — the
 * failure would only appear against a real database, which is the worst
 * place to discover it.
 */
export class InMemoryRideRepository implements RideRepository {
  private readonly rows: RideRecord[] = [];
  private sequence = 0;

  public async create(input: CreateRideInput): Promise<RideRecord> {
    const active = await this.findActiveForRider(input.riderId);
    if (active !== null) throw new RiderAlreadyOnRideError();

    this.sequence += 1;
    const record: RideRecord = {
      ...input,
      id: `ride_${this.sequence}`,
      status: RideStatus.REQUESTED,
      requestedAt: new Date(),
    };

    this.rows.push(record);
    return record;
  }

  public async findActiveForRider(riderId: string): Promise<RideRecord | null> {
    return (
      this.rows.find(
        (row) => row.riderId === riderId && isActiveRideStatus(row.status),
      ) ?? null
    );
  }

  public get size(): number {
    return this.rows.length;
  }
}
