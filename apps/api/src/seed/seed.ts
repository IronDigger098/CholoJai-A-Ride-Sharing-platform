import { DriverApplicationStatus } from '@cholojai/shared';
import { type Prisma, PrismaClient } from '@prisma/client';

import { PasswordHasherService } from '../common/security/password-hasher.service';
import { parseEnv } from '../config/env.schema';
import { loadDotenvForLocalDevelopment } from '../config/load-dotenv';

import {
  SEED_ACCOUNTS,
  SEED_PASSWORD,
  type SeedAccount,
} from './seed-accounts';

/**
 * Populate a development database with accounts you can actually sign in as.
 *
 * Before this existed there was no way to obtain an administrator: nothing
 * in the API can grant the first ADMIN role, so `/api/v1/admin` was
 * unreachable except by editing Postgres by hand. That is the gap this
 * closes, and it is why the seed lands here rather than being deferred as
 * developer convenience.
 *
 * Two properties matter more than the data itself.
 *
 * **It is idempotent.** Every write is an upsert keyed on a natural
 * identifier — email for users, plate number for vehicles. Running it twice
 * changes nothing the second time. The alternative, truncate-then-insert,
 * is simpler to write and destroys whatever you were in the middle of
 * testing; `pnpm db:reset` is there when a clean slate is what you want.
 *
 * **Passwords are hashed by the application's own hasher.** Not a hardcoded
 * digest: argon2 parameters change over time, and a pasted hash would
 * silently become one the login path treats as needing a rehash — or, if
 * the algorithm changed, one it could not verify at all. Running the real
 * `PasswordHasherService` means a seeded password is indistinguishable from
 * a registered one.
 */

/** Exit codes, so a CI step or a script can tell what went wrong. */
const EXIT_REFUSED = 2;
const EXIT_FAILED = 1;

async function seed(): Promise<void> {
  loadDotenvForLocalDevelopment();

  const env = parseEnv(process.env);

  /* The one guard that matters. This script writes accounts whose password
     is published in the repository; running it against production would be
     creating a documented backdoor, including an administrator. Refusing
     here is cheaper than any amount of care about who runs what where. */
  if (env.NODE_ENV === 'production') {
    console.error(
      '\nRefusing to seed a production database.\n\n' +
        'This script creates accounts with a password committed to the ' +
        'repository, one of which is an administrator.\n',
    );
    process.exit(EXIT_REFUSED);
  }

  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const hasher = new PasswordHasherService();

  try {
    /* Hashed once, not per account. Argon2 is deliberately slow — roughly
       50ms a time — and every seeded account shares the same password, so
       hashing per account would be five identical computations. They would
       produce five different hashes because of the per-hash salt, which is
       correct but pointless here. */
    const passwordHash = await hasher.hash(SEED_PASSWORD);

    for (const account of SEED_ACCOUNTS) {
      await upsertAccount(prisma, account, passwordHash);
    }

    report();
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Create or update one account and everything hanging off it.
 *
 * One transaction per account rather than one for the whole run: the
 * accounts are independent, and a failure on the fourth should leave the
 * first three usable rather than rolling back a database you were about to
 * work in.
 */
async function upsertAccount(
  prisma: PrismaClient,
  account: SeedAccount,
  passwordHash: string,
): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.user.findUnique({
      where: { email: account.email },
      select: { emailVerifiedAt: true },
    });

    /* Keep the original verification timestamp when there is one. Stamping
       `new Date()` on every run would make the seed *look* idempotent while
       silently rewriting a column each time — and "verified two seconds
       ago" is a lie about an account verified last week. */
    const emailVerifiedAt = account.emailVerified
      ? (existing?.emailVerifiedAt ?? new Date())
      : null;

    const user = await tx.user.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        passwordHash,
        fullName: account.fullName,
        phone: account.phone,
        emailVerifiedAt,
      },
      update: {
        /* Reset the password on every run. Someone who changed a seeded
           account's password while testing should get the documented one
           back, not be locked out of the account the docs told them to use. */
        passwordHash,
        fullName: account.fullName,
        phone: account.phone,
        emailVerifiedAt,
        // A previously soft-deleted seed account comes back.
        deletedAt: null,
      },
    });

    for (const role of account.roles) {
      await tx.roleGrant.upsert({
        where: { userId_role: { userId: user.id, role } },
        create: { userId: user.id, role },
        update: {},
      });
    }

    /* Roles the seed no longer lists are removed, so editing this file and
       re-running actually converges on what it says. An additive-only seed
       drifts: demote an account by hand, re-run, and it stays demoted. */
    await tx.roleGrant.deleteMany({
      where: { userId: user.id, role: { notIn: [...account.roles] } },
    });

    if (account.driverProfile === undefined) return;

    const profile = await tx.driverProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        applicationStatus: account.driverProfile.applicationStatus,
        licenseNoMasked: account.driverProfile.licenseNoMasked,
        isAvailable: account.driverProfile.isAvailable,
        approvedAt:
          account.driverProfile.applicationStatus ===
          DriverApplicationStatus.APPROVED
            ? new Date()
            : null,
      },
      update: {
        applicationStatus: account.driverProfile.applicationStatus,
        licenseNoMasked: account.driverProfile.licenseNoMasked,
        isAvailable: account.driverProfile.isAvailable,
      },
    });

    /* Keyed on the plate number, which is uniquely indexed. Keying on the
       driver instead would create a second vehicle on every run and trip
       `one_active_vehicle_per_driver` — the partial unique index from M2
       doing exactly what it was written for. */
    await tx.vehicle.upsert({
      where: { plateNo: account.driverProfile.vehicle.plateNo },
      create: {
        driverProfileId: profile.id,
        type: account.driverProfile.vehicle.type,
        make: account.driverProfile.vehicle.make,
        model: account.driverProfile.vehicle.model,
        plateNo: account.driverProfile.vehicle.plateNo,
        isActive: true,
      },
      update: { driverProfileId: profile.id, isActive: true },
    });
  });
}

/** Print what was created, so the credentials are one scroll away. */
function report(): void {
  const lines = [
    '',
    `Seeded ${SEED_ACCOUNTS.length} accounts. Password for all of them:`,
    '',
    `    ${SEED_PASSWORD}`,
    '',
  ];

  for (const account of SEED_ACCOUNTS) {
    lines.push(`  ${account.email}`);
    lines.push(`    roles: ${account.roles.join(', ')}`);
    lines.push(
      `    verified: ${account.emailVerified ? 'yes' : 'no'} — ${account.purpose}`,
    );
    lines.push('');
  }

  console.log(lines.join('\n'));
}

seed().catch((error: unknown) => {
  console.error('\nSeeding failed.\n');
  console.error(error);
  process.exit(EXIT_FAILED);
});
