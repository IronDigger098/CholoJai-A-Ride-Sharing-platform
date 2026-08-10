import { DriverApplicationStatus, UserRole } from '@cholojai/shared';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { InMemoryDriverProfileRepository } from '../../testing/in-memory-driver-profile.repository';
import { type AdminService } from '../admin/admin.service';

import {
  ApplicationAlreadyDecidedError,
  AlreadyAppliedError,
  DriverProfileNotFoundError,
} from './drivers.errors';
import { DriversService } from './drivers.service';

const RIDER = 'user_rider_1';
const ADMIN = 'user_admin_1';

/**
 * A stand-in for `AdminService` that records the grants it was asked for.
 *
 * Only `grantRole` is reachable from this service, so only that is
 * implemented — a fuller fake would be untested code pretending to be a
 * test double.
 */
function makeAdmin(): {
  service: AdminService;
  grants: { userId: string; role: UserRole }[];
  failNext: () => void;
} {
  const grants: { userId: string; role: UserRole }[] = [];
  let shouldFail = false;

  const service = {
    grantRole: (_actorId: string, userId: string, role: UserRole) => {
      if (shouldFail) return Promise.reject(new Error('role grant failed'));
      grants.push({ userId, role });
      return Promise.resolve({ user: { id: userId } });
    },
  } as unknown as AdminService;

  return {
    service,
    grants,
    failNext: () => {
      shouldFail = true;
    },
  };
}

describe('DriversService', () => {
  let profiles: InMemoryDriverProfileRepository;
  let admin: ReturnType<typeof makeAdmin>;
  let service: DriversService;

  beforeEach(() => {
    profiles = new InMemoryDriverProfileRepository();
    profiles.register(RIDER, 'Nabila Rahman', 'nabila@cholojai.test');
    admin = makeAdmin();
    service = new DriversService(profiles, admin.service);
  });

  describe('apply', () => {
    it('creates a pending application', async () => {
      const profile = await service.apply(RIDER, 'DK-1234567890');

      expect(profile.applicationStatus).toBe(DriverApplicationStatus.PENDING);
      expect(profile.approvedAt).toBeNull();
    });

    it('never stores the licence number in full', async () => {
      /* The platform cannot verify a licence against any authority, so
         keeping the number would be holding an identity document for no
         purpose it can serve. */
      const profile = await service.apply(RIDER, 'DK-1234567890');

      expect(profile.licenseNoMasked).not.toContain('1234567');
      expect(profile.licenseNoMasked).toMatch(/7890$/u);
    });

    it('refuses a second application', async () => {
      await service.apply(RIDER, 'DK-1234567890');

      await expect(service.apply(RIDER, 'DK-9999999999')).rejects.toThrow(
        AlreadyAppliedError,
      );
    });

    it('grants no role on its own', async () => {
      /* Applying is something a rider does. Until an administrator
         approves, the account is an ordinary rider. */
      await service.apply(RIDER, 'DK-1234567890');

      expect(admin.grants).toEqual([]);
    });
  });

  describe('approve', () => {
    it('marks the application approved and grants the driver role', async () => {
      const { id } = await service.apply(RIDER, 'DK-1234567890');

      const approved = await service.approve(ADMIN, id);

      expect(approved.applicationStatus).toBe(DriverApplicationStatus.APPROVED);
      expect(approved.approvedAt).not.toBeNull();
      expect(admin.grants).toEqual([{ userId: RIDER, role: UserRole.DRIVER }]);
    });

    it('leaves the application pending if the role grant fails', async () => {
      /* The ordering that makes a partial failure recoverable. A role
         without an approved profile opens nothing, and the application can
         be approved again; the reverse order would strand an approved
         driver whose token never carries the role. */
      const { id } = await service.apply(RIDER, 'DK-1234567890');
      admin.failNext();

      await expect(service.approve(ADMIN, id)).rejects.toThrow(
        'role grant failed',
      );

      const profile = await service.myProfile(RIDER);
      expect(profile?.applicationStatus).toBe(DriverApplicationStatus.PENDING);
    });

    it('refuses to decide an application twice', async () => {
      /* Two administrators working the same queue. The first decision
         stands, because a second silently overwriting it is worse than an
         error message. */
      const { id } = await service.apply(RIDER, 'DK-1234567890');
      await service.approve(ADMIN, id);

      await expect(service.approve(ADMIN, id)).rejects.toThrow(
        ApplicationAlreadyDecidedError,
      );
    });

    it('reports an unknown application as not found', async () => {
      await expect(service.approve(ADMIN, 'driver_nope')).rejects.toThrow(
        DriverProfileNotFoundError,
      );
    });
  });

  describe('reject', () => {
    it('records the reason and grants nothing', async () => {
      const { id } = await service.apply(RIDER, 'DK-1234567890');

      const rejected = await service.reject(ADMIN, id, 'Licence expired');

      expect(rejected.applicationStatus).toBe(DriverApplicationStatus.REJECTED);
      expect(rejected.rejectionReason).toBe('Licence expired');
      expect(admin.grants).toEqual([]);
    });

    it('cannot reject an application already approved', async () => {
      const { id } = await service.apply(RIDER, 'DK-1234567890');
      await service.approve(ADMIN, id);

      await expect(
        service.reject(ADMIN, id, 'Changed my mind'),
      ).rejects.toThrow(ApplicationAlreadyDecidedError);
    });
  });

  describe('listApplications', () => {
    it('returns pending applications with the applicant’s identity', async () => {
      await service.apply(RIDER, 'DK-1234567890');

      const applications = await service.listApplications({
        status: DriverApplicationStatus.PENDING,
      });

      expect(applications).toHaveLength(1);
      expect(applications[0]?.fullName).toBe('Nabila Rahman');
    });

    it('excludes applications that have been decided', async () => {
      const { id } = await service.apply(RIDER, 'DK-1234567890');
      await service.approve(ADMIN, id);

      const pending = await service.listApplications({
        status: DriverApplicationStatus.PENDING,
      });

      expect(pending).toEqual([]);
    });
  });

  describe('myProfile', () => {
    it('is null before the caller has applied', async () => {
      expect(await service.myProfile(RIDER)).toBeNull();
    });
  });
});
