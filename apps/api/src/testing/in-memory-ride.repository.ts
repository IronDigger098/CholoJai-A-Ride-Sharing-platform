import { isActiveRideStatus, RideStatus } from '@cholojai/shared';

import {
  type CreateRideInput,
  type RideRecord,
  type RidePageQuery,
  type RidePageResult,
  type RideRepository,
  type TransitionRideInput,
} from '../modules/rides/ride-repository.port';
import {
  DriverAlreadyOnRideError,
  RiderAlreadyOnRideError,
} from '../modules/rides/rides.errors';

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
      driverProfileId: null,
      vehicleId: null,
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

  public async findById(rideId: string): Promise<RideRecord | null> {
    return this.rows.find((row) => row.id === rideId) ?? null;
  }

  public async listOpenOffers(limit: number): Promise<readonly RideRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.status === RideStatus.REQUESTED && row.driverProfileId === null,
      )
      .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Move a ride, if it is still in `from`.
   *
   * Single-threaded, so the check and the write cannot be interleaved here —
   * which is exactly why this fake cannot prove the real guarantee. The
   * `from` comparison is still written out rather than assumed, so a service
   * that forgets to pass the current status fails here rather than only
   * against PostgreSQL.
   */
  public async transition(input: TransitionRideInput): Promise<boolean> {
    const index = this.rows.findIndex(
      (row) =>
        row.id === input.rideId &&
        row.status === input.from &&
        (input.requireDriverProfileId === undefined ||
          row.driverProfileId === input.requireDriverProfileId),
    );

    if (index === -1) return false;

    const existing = this.rows[index];
    if (existing === undefined) return false;

    /* Mirrors `one_active_ride_per_driver`. The real guarantee is the
       database's; this exists so a unit test cannot prove a driver may hold
       two rides at once. */
    if (input.assign !== undefined) {
      const busy = this.rows.some(
        (row) =>
          row.driverProfileId === input.assign?.driverProfileId &&
          isActiveRideStatus(row.status),
      );

      if (busy) throw new DriverAlreadyOnRideError();
    }

    this.rows[index] = {
      ...existing,
      status: input.to,
      ...(input.assign === undefined
        ? {}
        : {
            driverProfileId: input.assign.driverProfileId,
            vehicleId: input.assign.vehicleId,
          }),
    };

    return true;
  }

  public async listForRider(
    riderId: string,
    page: RidePageQuery,
  ): Promise<RidePageResult> {
    /* Insertion order is the tiebreak, mirroring the adapter's `id` tiebreak.
       Rides created inside one test share a millisecond, so a sort on
       `requestedAt` alone is not a total order and the cursor walk would be
       flaky — passing or failing on how the engine happened to arrange
       equal elements. */
    const owned = this.rows
      .map((row, index) => ({ row, index }))
      .filter((entry) => entry.row.riderId === riderId)
      .sort(
        (a, b) =>
          b.row.requestedAt.getTime() - a.row.requestedAt.getTime() ||
          b.index - a.index,
      )
      .map((entry) => entry.row);

    /* The cursor is exclusive, matching Prisma's `skip: 1`. An unknown
       cursor yields an empty page rather than the first one — silently
       restarting from the top would make a client with a stale cursor
       re-render history it had already scrolled past. */
    const start =
      page.cursor === undefined
        ? 0
        : owned.findIndex((row) => row.id === page.cursor) + 1;

    const slice =
      page.cursor !== undefined && start === 0
        ? []
        : owned.slice(start, start + page.limit);

    return {
      rides: slice,
      hasNextPage: start + slice.length < owned.length,
    };
  }

  public get size(): number {
    return this.rows.length;
  }
}
