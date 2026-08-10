import { type DriverApplicationStatus } from '@cholojai/shared';

/**
 * What the drivers module needs from storage.
 */

export interface DriverProfileRecord {
  readonly id: string;
  readonly userId: string;
  readonly applicationStatus: DriverApplicationStatus;
  readonly rejectionReason: string | null;
  readonly licenseNoMasked: string | null;
  readonly isAvailable: boolean;
  readonly ratingAvgX100: number;
  readonly ratingCount: number;
  readonly approvedAt: Date | null;
  readonly createdAt: Date;
}

/** A profile joined with the applicant's identity, for admin review. */
export interface DriverApplicationRecord extends DriverProfileRecord {
  readonly fullName: string;
  readonly email: string;
}

export interface CreateDriverProfileInput {
  readonly userId: string;
  readonly licenseNoMasked: string;
}

export interface DriverProfileRepository {
  /**
   * Create a PENDING profile.
   *
   * Throws `AlreadyAppliedError` when the user already has one. `user_id` is
   * uniquely indexed, so the database decides that rather than a check in
   * the service — two taps on a slow connection would otherwise both pass a
   * read-then-write and produce two applications.
   */
  create(input: CreateDriverProfileInput): Promise<DriverProfileRecord>;

  findByUserId(userId: string): Promise<DriverProfileRecord | null>;

  findById(driverProfileId: string): Promise<DriverProfileRecord | null>;

  listByStatus(
    status: DriverApplicationStatus,
  ): Promise<readonly DriverApplicationRecord[]>;

  /**
   * Move an application to a decided state, if it is still PENDING.
   *
   * Returns null when it had already been decided — two administrators
   * reviewing the same queue must not both succeed, and the expected status
   * in the WHERE clause is what makes that one statement rather than a check
   * followed by a write. Same mechanism as `RideRepository.transition`.
   */
  decide(input: DecideApplicationInput): Promise<DriverProfileRecord | null>;
}

export interface DecideApplicationInput {
  readonly driverProfileId: string;
  readonly status: Extract<DriverApplicationStatus, 'APPROVED' | 'REJECTED'>;
  readonly at: Date;
  readonly rejectionReason?: string;
}

export const DRIVER_PROFILE_REPOSITORY = Symbol('DRIVER_PROFILE_REPOSITORY');
