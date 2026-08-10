import {
  type DriverApplication,
  type DriverApplicationListQuery,
  DriverApplicationStatus as Status,
  type DriverProfile,
  UserRole,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { AdminService } from '../admin/admin.service';

import {
  DRIVER_PROFILE_REPOSITORY,
  type DriverApplicationRecord,
  type DriverProfileRecord,
  type DriverProfileRepository,
} from './driver-profile-repository.port';
import {
  ApplicationAlreadyDecidedError,
  DriverNotApprovedError,
  DriverProfileNotFoundError,
} from './drivers.errors';

/** How much of a licence number survives. */
const VISIBLE_LICENCE_DIGITS = 4;

/**
 * Driver applications and their review.
 */
@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  public constructor(
    @Inject(DRIVER_PROFILE_REPOSITORY)
    private readonly profiles: DriverProfileRepository,
    private readonly admin: AdminService,
  ) {}

  /**
   * Apply to drive.
   *
   * The licence number is masked here and the full value is never persisted.
   * A real platform verifies it against an authority and keeps it under a
   * retention policy; this one can do neither, so storing it would mean
   * holding an identity document for no purpose it can serve.
   */
  public async apply(
    userId: string,
    licenseNo: string,
  ): Promise<DriverProfile> {
    const profile = await this.profiles.create({
      userId,
      licenseNoMasked: maskLicence(licenseNo),
    });

    this.logger.log(`User ${userId} applied to drive`);

    return toProfile(profile);
  }

  /** The caller's own application, or null if they have never applied. */
  public async myProfile(userId: string): Promise<DriverProfile | null> {
    const profile = await this.profiles.findByUserId(userId);
    return profile === null ? null : toProfile(profile);
  }

  /**
   * The caller's approved driver profile, or a refusal.
   *
   * Every driver-only endpoint goes through this rather than trusting the
   * DRIVER role in the token. The role and the profile are two writes that
   * can land apart, and a token issued between them carries a role its
   * holder cannot yet exercise — this is what makes that harmless.
   *
   * Returns the id rather than the record: callers need to attach a driver
   * to something, not to read their rating.
   */
  public async requireApprovedProfileId(userId: string): Promise<string> {
    const profile = await this.profiles.findByUserId(userId);

    /* The optional chain covers both cases: no profile yields `undefined`,
       which never equals APPROVED. */
    if (profile?.applicationStatus !== Status.APPROVED) {
      throw new DriverNotApprovedError();
    }

    return profile.id;
  }

  public async listApplications(
    query: DriverApplicationListQuery,
  ): Promise<readonly DriverApplication[]> {
    const records = await this.profiles.listByStatus(query.status);
    return records.map(toApplication);
  }

  /**
   * Approve an application and grant the DRIVER role.
   *
   * Two writes across two modules, and the order is the safety. The role is
   * granted first because it is idempotent and, on its own, useless — every
   * driver endpoint also requires an APPROVED profile. If the second write
   * fails, the account holds a role it cannot exercise and the application
   * is still pending, which is a state an administrator can simply retry.
   * The reverse order would produce an approved driver whose token never
   * carries the role, and no retry would fix it because the application is
   * no longer pending.
   */
  public async approve(
    adminId: string,
    driverProfileId: string,
  ): Promise<DriverProfile> {
    const existing = await this.profiles.findById(driverProfileId);
    if (existing === null) {
      throw new DriverProfileNotFoundError(driverProfileId);
    }

    await this.admin.grantRole(adminId, existing.userId, UserRole.DRIVER);

    const decided = await this.profiles.decide({
      driverProfileId,
      status: Status.APPROVED,
      at: new Date(),
    });

    /* Null means it left PENDING between the read above and this write —
       another administrator decided it first. */
    if (decided === null) throw new ApplicationAlreadyDecidedError();

    this.logger.log(`Admin ${adminId} approved driver ${driverProfileId}`);

    return toProfile(decided);
  }

  /**
   * Reject an application, with a reason the applicant can act on.
   *
   * No role is revoked, because none was granted. A rejected applicant is an
   * ordinary rider whose account is untouched.
   */
  public async reject(
    adminId: string,
    driverProfileId: string,
    reason: string,
  ): Promise<DriverProfile> {
    const existing = await this.profiles.findById(driverProfileId);
    if (existing === null) {
      throw new DriverProfileNotFoundError(driverProfileId);
    }

    const decided = await this.profiles.decide({
      driverProfileId,
      status: Status.REJECTED,
      at: new Date(),
      rejectionReason: reason,
    });

    if (decided === null) throw new ApplicationAlreadyDecidedError();

    this.logger.log(`Admin ${adminId} rejected driver ${driverProfileId}`);

    return toProfile(decided);
  }
}

/**
 * Keep the last few characters, replace the rest.
 *
 * Enough for a driver to recognise their own number and for support to
 * confirm it over the phone; not enough to reconstruct it.
 */
function maskLicence(licenseNo: string): string {
  const trimmed = licenseNo.trim();
  const visible = trimmed.slice(-VISIBLE_LICENCE_DIGITS);

  return `${'•'.repeat(Math.max(0, trimmed.length - VISIBLE_LICENCE_DIGITS))}${visible}`;
}

function toProfile(record: DriverProfileRecord): DriverProfile {
  return {
    id: record.id,
    applicationStatus: record.applicationStatus,
    rejectionReason: record.rejectionReason,
    licenseNoMasked: record.licenseNoMasked,
    isAvailable: record.isAvailable,
    ratingAvgX100: record.ratingAvgX100,
    ratingCount: record.ratingCount,
    approvedAt: record.approvedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

function toApplication(record: DriverApplicationRecord): DriverApplication {
  return {
    ...toProfile(record),
    userId: record.userId,
    fullName: record.fullName,
    email: record.email,
  };
}
