/**
 * What the health module actually needs from the database.
 *
 * `HealthService` depends on this interface rather than on `PrismaService`
 * directly — dependency inversion, and it earns its keep three ways:
 *
 *  1. The health module knows nothing about Prisma. Swapping the ORM, or
 *     probing a read replica instead, changes one binding.
 *  2. Tests need no database driver at all. Depending on the concrete class
 *     would pull the generated Prisma client into the test process, which
 *     turns a routing test into an integration test by accident.
 *  3. The dependency is stated precisely: health needs *reachability*, not
 *     the ability to run arbitrary queries.
 */
export interface DatabaseProbe {
  /** Resolves true when the database answers, false otherwise. Never throws. */
  isReachable(): Promise<boolean>;
}

/**
 * Injection token for {@link DatabaseProbe}.
 *
 * An interface is erased at compile time, so it cannot be a DI token on its
 * own — Nest needs a runtime value. A `Symbol` cannot collide with another
 * token the way a plain string can.
 */
export const DATABASE_PROBE = Symbol('DATABASE_PROBE');
