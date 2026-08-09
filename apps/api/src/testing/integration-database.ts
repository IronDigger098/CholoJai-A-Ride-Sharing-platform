import { afterAll, beforeAll, beforeEach, describe } from '@jest/globals';

import { PrismaService } from '../common/prisma/prisma.service';

import { makeTestConfig } from './env.fixture';

/**
 * Support for tests that talk to a real PostgreSQL.
 *
 * Everything below exists because the in-memory fakes, however carefully
 * written, cannot check the things that matter most about the persistence
 * layer. A fake `rotate` is atomic because JavaScript is single-threaded;
 * the real one is atomic because PostgreSQL takes a row lock and
 * re-evaluates the predicate after acquiring it. Those are different
 * claims, and only one of them can fail in production.
 */

const DATABASE_TEST_URL = process.env['DATABASE_TEST_URL'];

/**
 * The one shape a suite block is ever used in here.
 *
 * Named explicitly rather than inferred. Inference would give this the type
 * of `describe.skip`, which lives in an anonymous namespace inside
 * `@jest/types` and therefore cannot be written into a declaration file —
 * TS4023, and only when something actually emits. Declaring the narrow
 * contract we use is both nameable and more honest about the API.
 */
type SuiteBlock = (name: string, suite: () => void) => void;

/**
 * Integration suites run only when `DATABASE_TEST_URL` is set.
 *
 * Gated on an explicit variable rather than probing for a connection. A
 * suite that quietly skips when it cannot reach a database is a suite that
 * reports green having tested nothing — and this is the only place the
 * database code is tested at all, so a silent skip would be the worst
 * possible failure mode.
 */
export const describeWithDatabase: SuiteBlock =
  DATABASE_TEST_URL === undefined ? describe.skip : describe;

/**
 * Refuse to run against anything that is not obviously a test database.
 *
 * These suites truncate every table between tests. Pointed at a development
 * database that costs an afternoon of seeded data; pointed at anything
 * further along it is a catastrophe. Requiring the word "test" in the
 * database name is a crude check, and crude is the right shape here: it
 * cannot be satisfied by accident.
 */
function assertIsTestDatabase(url: string): void {
  const databaseName = new URL(url).pathname.replace(/^\//u, '');

  if (!databaseName.includes('test')) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}". ` +
        'These tests truncate every table. Point DATABASE_TEST_URL at a ' +
        'database whose name contains "test".',
    );
  }
}

/**
 * A Prisma client pointed at the test database.
 *
 * Deliberately the real `PrismaService` rather than a bare `PrismaClient`:
 * the service is what production uses, including its connection options and
 * lifecycle hooks, and testing a different object would leave those
 * untested.
 */
export function createTestPrisma(): PrismaService {
  const url = DATABASE_TEST_URL ?? '';
  assertIsTestDatabase(url);

  return new PrismaService(makeTestConfig({ DATABASE_URL: url }));
}

/**
 * Empty every table.
 *
 * `TRUNCATE users CASCADE` reaches everything: `TRUNCATE` cascades along
 * foreign keys regardless of their `ON DELETE` behaviour, so one statement
 * clears role grants, tokens, driver profiles, vehicles, rides, and
 * payments. Listing tables individually would mean this helper silently
 * stops clearing whatever gets added next.
 *
 * Called before each test rather than after: a test that fails midway
 * leaves its rows behind for inspection, and the next test still starts
 * clean.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
}

/**
 * Bind a connected, freshly-emptied database to the surrounding suite.
 *
 * Call once at the top of a `describeWithDatabase` block; it registers the
 * connect / truncate / disconnect hooks and returns an accessor for the
 * client. Every integration suite needs exactly this, and three hand-written
 * copies of it is three places for the lifecycle to drift.
 *
 * The accessor exists rather than a plain variable because a variable would
 * have to be declared with a definite-assignment assertion — a promise to
 * the compiler that `beforeAll` ran, which is precisely the thing that is
 * false when the setup fails.
 */
export function useTestDatabase(): () => PrismaService {
  let prisma: PrismaService | null = null;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    /* Optional-chained deliberately. When `beforeAll` throws — an
       ungenerated client, an unreachable server — `prisma` is still null,
       and an unguarded `$disconnect()` would raise a second, meaningless
       TypeError that Jest reports alongside the first and which reads like
       the actual problem. The real message must survive. */
    await prisma?.$disconnect();
    prisma = null;
  });

  beforeEach(async () => {
    await resetDatabase(database());
  });

  function database(): PrismaService {
    if (prisma === null) {
      throw new Error(
        'The test database is not connected. useTestDatabase() must be ' +
          'called inside the describe block whose tests use it.',
      );
    }

    return prisma;
  }

  return database;
}
