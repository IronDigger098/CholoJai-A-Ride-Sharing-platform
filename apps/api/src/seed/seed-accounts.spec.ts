import {
  DriverApplicationStatus,
  emailSchema,
  passwordSchema,
  phoneSchema,
  UserRole,
} from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';

import { SEED_ACCOUNTS, SEED_PASSWORD } from './seed-accounts';

/**
 * The seed data is checked against the API's own contracts.
 *
 * A seed script cannot be meaningfully unit tested — it writes to a
 * database, and asserting that Prisma was called is testing the mock. What
 * *can* be tested, and is worth more, is that the data it writes is data
 * the application would have accepted through its public endpoints. Seeding
 * an account the API itself would refuse to create is the kind of quiet
 * inconsistency that surfaces months later as "why can't this user change
 * their password".
 */
describe('seed accounts', () => {
  it('uses a password the API would accept', () => {
    /* If the policy tightens to sixteen characters, this fails here rather
       than as a mysterious rejection the first time someone tries to change
       a seeded account's password. */
    expect(passwordSchema.safeParse(SEED_PASSWORD).success).toBe(true);
  });

  it('uses email addresses the API would accept', () => {
    for (const account of SEED_ACCOUNTS) {
      expect(emailSchema.safeParse(account.email).success).toBe(true);
    }
  });

  it('uses phone numbers the API would accept', () => {
    for (const account of SEED_ACCOUNTS) {
      if (account.phone === null) continue;
      expect(phoneSchema.safeParse(account.phone).success).toBe(true);
    }
  });

  it('keeps every address inside the reserved .local suffix', () => {
    /* RFC 6762 reserves `.local`, so it cannot resolve on the public
       internet. A seeded verification or password-reset email therefore
       cannot reach a real mailbox belonging to someone else — which a
       typo'd `@gmail.com` in this file absolutely could. */
    for (const account of SEED_ACCOUNTS) {
      expect(account.email.endsWith('@cholojai.local')).toBe(true);
    }
  });

  it('has no duplicate addresses', () => {
    // The seed upserts by email, so a duplicate would silently mean one
    // account overwriting another and one fewer account than intended.
    const emails = SEED_ACCOUNTS.map((account) => account.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('has no duplicate plate numbers', () => {
    // Vehicles upsert by plate, which is uniquely indexed.
    const plates = SEED_ACCOUNTS.flatMap((account) =>
      account.driverProfile === undefined
        ? []
        : [account.driverProfile.vehicle.plateNo],
    );
    expect(new Set(plates).size).toBe(plates.length);
  });

  it('gives every account the RIDER role', () => {
    // Decision D1: every account is a rider and roles are added on top.
    // An account without it can sign in and do nothing.
    for (const account of SEED_ACCOUNTS) {
      expect(account.roles).toContain(UserRole.RIDER);
    }
  });

  it('includes exactly one administrator', () => {
    /* The account that bootstraps the role system. Zero and the admin API
       is unreachable; several and the seed is quietly handing out the
       highest privilege in the system more freely than anyone intended. */
    const admins = SEED_ACCOUNTS.filter((account) =>
      account.roles.includes(UserRole.ADMIN),
    );

    expect(admins).toHaveLength(1);
    expect(admins[0]?.email).toBe('admin@cholojai.local');
  });

  it('includes an unverified rider', () => {
    // So the verification and resend flows can be exercised without
    // registering somebody new every time.
    expect(SEED_ACCOUNTS.some((account) => !account.emailVerified)).toBe(true);
  });

  it('gives the DRIVER role only to an approved driver', () => {
    /* The invariant the M7 application flow will maintain. A pending
       applicant holding DRIVER would appear in matching before anyone
       reviewed them — which is the whole point of having a review. */
    for (const account of SEED_ACCOUNTS) {
      if (!account.roles.includes(UserRole.DRIVER)) continue;

      expect(account.driverProfile?.applicationStatus).toBe(
        DriverApplicationStatus.APPROVED,
      );
    }
  });

  it('leaves a pending applicant without the DRIVER role', () => {
    const pending = SEED_ACCOUNTS.filter(
      (account) =>
        account.driverProfile?.applicationStatus ===
        DriverApplicationStatus.PENDING,
    );

    expect(pending.length).toBeGreaterThan(0);
    for (const account of pending) {
      expect(account.roles).not.toContain(UserRole.DRIVER);
    }
  });

  it('never marks a pending applicant available', () => {
    // `isAvailable` feeds driver matching. An unreviewed applicant showing
    // as available is an unreviewed applicant receiving ride requests.
    for (const account of SEED_ACCOUNTS) {
      if (
        account.driverProfile?.applicationStatus ===
        DriverApplicationStatus.PENDING
      ) {
        expect(account.driverProfile.isAvailable).toBe(false);
      }
    }
  });

  it('masks every licence number', () => {
    // Seed data is copied into screenshots, issues, and demos. Nothing here
    // should look like a real document number even by accident.
    for (const account of SEED_ACCOUNTS) {
      if (account.driverProfile === undefined) continue;
      expect(account.driverProfile.licenseNoMasked).toContain('****');
    }
  });

  it('explains what each account is for', () => {
    // The purpose strings are printed after seeding. An account nobody can
    // explain is an account nobody should be signing in as.
    for (const account of SEED_ACCOUNTS) {
      expect(account.purpose.length).toBeGreaterThan(20);
    }
  });
});
