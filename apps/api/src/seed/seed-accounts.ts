import {
  DriverApplicationStatus,
  UserRole,
  VehicleType,
} from '@cholojai/shared';

/**
 * The accounts `pnpm db:seed` creates.
 *
 * Kept as pure data, separate from the script that writes it, so the parts
 * worth checking can be checked without a database — see the spec beside
 * this file. The most valuable of those checks is that every seeded
 * password satisfies the API's own password policy: seeding an account the
 * application would refuse to create is the kind of inconsistency that
 * surfaces months later as "why can't I change my password".
 */

/**
 * One password for every seeded account.
 *
 * Deliberately public and deliberately obvious. These credentials exist to
 * be typed into a form by whoever is working on the project, so hiding them
 * would defeat the purpose — and pretending they are secret is worse than
 * admitting they are not. The protection is that the seed refuses to run
 * when `NODE_ENV=production`, not that the string is hard to guess.
 *
 * `.local` addresses throughout: an RFC 6762 reserved suffix that cannot
 * resolve on the public internet, so a stray password-reset or verification
 * email can never reach a real mailbox belonging to someone else.
 */
export const SEED_PASSWORD = 'cholojai-dev-password';

export interface SeedVehicle {
  readonly type: VehicleType;
  readonly make: string;
  readonly model: string;
  readonly plateNo: string;
}

export interface SeedDriverProfile {
  readonly applicationStatus: DriverApplicationStatus;
  readonly licenseNoMasked: string;
  readonly isAvailable: boolean;
  readonly vehicle: SeedVehicle;
}

export interface SeedAccount {
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly roles: readonly UserRole[];
  /** Seeded accounts are verified unless a flow needs an unverified one. */
  readonly emailVerified: boolean;
  /** What this account is for, printed after seeding. */
  readonly purpose: string;
  readonly driverProfile?: SeedDriverProfile;
}

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  {
    email: 'admin@cholojai.local',
    fullName: 'Shamima Akter',
    phone: '+8801711000001',
    roles: [UserRole.RIDER, UserRole.ADMIN],
    emailVerified: true,
    purpose:
      'Administrator. Bootstraps the role system — nothing else can grant ' +
      'the first ADMIN, so without this account /api/v1/admin is ' +
      'unreachable by anyone.',
  },
  {
    email: 'rafiq@cholojai.local',
    fullName: 'Rafiqul Islam',
    phone: '+8801711000002',
    roles: [UserRole.RIDER, UserRole.DRIVER],
    emailVerified: true,
    purpose: 'Approved driver with an active CNG. Available for matching.',
    driverProfile: {
      applicationStatus: DriverApplicationStatus.APPROVED,
      licenseNoMasked: 'DL-****-4417',
      isAvailable: true,
      vehicle: {
        type: VehicleType.CNG,
        make: 'Bajaj',
        model: 'RE Compact',
        plateNo: 'DHAKA-METRO-THA-11-2024',
      },
    },
  },
  {
    email: 'nabila@cholojai.local',
    fullName: 'Nabila Rahman',
    phone: '+8801711000003',
    roles: [UserRole.RIDER],
    emailVerified: true,
    purpose: 'Ordinary verified rider. The default account for booking flows.',
  },
  {
    email: 'unverified@cholojai.local',
    fullName: 'Tanvir Hasan',
    phone: '+8801711000004',
    roles: [UserRole.RIDER],
    emailVerified: false,
    purpose:
      'Rider who never confirmed their address. Exists so the verification ' +
      'and resend flows can be exercised without registering someone new ' +
      'every time.',
  },
  {
    email: 'pending-driver@cholojai.local',
    fullName: 'Sabbir Ahmed',
    phone: '+8801711000005',
    roles: [UserRole.RIDER],
    emailVerified: true,
    purpose:
      'Driver application awaiting review. Holds no DRIVER role yet — that ' +
      'is what the approval flow in M7 will grant.',
    driverProfile: {
      applicationStatus: DriverApplicationStatus.PENDING,
      licenseNoMasked: 'DL-****-9082',
      isAvailable: false,
      vehicle: {
        type: VehicleType.BIKE,
        make: 'Honda',
        model: 'CB Hornet',
        plateNo: 'DHAKA-METRO-HA-19-8830',
      },
    },
  },
];
