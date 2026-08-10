import { DriverApplicationStatus as Status } from '@cholojai/shared';

import {
  type CreateDriverProfileInput,
  type DecideApplicationInput,
  type DriverApplicationRecord,
  type DriverProfileRecord,
  type DriverProfileRepository,
} from '../modules/drivers/driver-profile-repository.port';
import { AlreadyAppliedError } from '../modules/drivers/drivers.errors';

/**
 * In-memory {@link DriverProfileRepository}.
 *
 * The uniqueness check and the PENDING guard in `decide` mirror what the
 * database enforces. A fake that let a user apply twice, or let two
 * administrators both decide one application, would make unit tests agree
 * with a system that behaves differently.
 */
export class InMemoryDriverProfileRepository implements DriverProfileRepository {
  private readonly rows = new Map<string, DriverProfileRecord>();
  private readonly identities = new Map<
    string,
    { fullName: string; email: string }
  >();
  private sequence = 0;

  /** Give a user a name and email, so `listByStatus` can join them. */
  public register(userId: string, fullName: string, email: string): void {
    this.identities.set(userId, { fullName, email });
  }

  public async create(
    input: CreateDriverProfileInput,
  ): Promise<DriverProfileRecord> {
    const existing = await this.findByUserId(input.userId);
    if (existing !== null) throw new AlreadyAppliedError();

    this.sequence += 1;
    const record: DriverProfileRecord = {
      id: `driver_${this.sequence}`,
      userId: input.userId,
      applicationStatus: Status.PENDING,
      rejectionReason: null,
      licenseNoMasked: input.licenseNoMasked,
      isAvailable: false,
      ratingAvgX100: 0,
      ratingCount: 0,
      approvedAt: null,
      createdAt: new Date(),
    };

    this.rows.set(record.id, record);
    return record;
  }

  public async findByUserId(
    userId: string,
  ): Promise<DriverProfileRecord | null> {
    return [...this.rows.values()].find((row) => row.userId === userId) ?? null;
  }

  public async findById(id: string): Promise<DriverProfileRecord | null> {
    return this.rows.get(id) ?? null;
  }

  public async listByStatus(
    status: Status,
  ): Promise<readonly DriverApplicationRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.applicationStatus === status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((row) => ({
        ...row,
        fullName: this.identities.get(row.userId)?.fullName ?? 'Unknown',
        email: this.identities.get(row.userId)?.email ?? 'unknown@example.test',
      }));
  }

  public async decide(
    input: DecideApplicationInput,
  ): Promise<DriverProfileRecord | null> {
    const existing = this.rows.get(input.driverProfileId);

    if (existing === undefined) return null;
    if (existing.applicationStatus !== Status.PENDING) return null;

    const decided: DriverProfileRecord = {
      ...existing,
      applicationStatus: input.status,
      approvedAt: input.status === Status.APPROVED ? input.at : null,
      rejectionReason:
        input.status === Status.REJECTED
          ? (input.rejectionReason ?? null)
          : null,
    };

    this.rows.set(decided.id, decided);
    return decided;
  }
}
