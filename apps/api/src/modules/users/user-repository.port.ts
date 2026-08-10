import { type UserRole } from '@cholojai/shared';

/**
 * What the auth and user features need from persistence.
 *
 * A *port* in the hexagonal sense: the domain declares the operations it
 * requires, and an adapter (`PrismaUserRepository`) satisfies them. This is
 * the Repository Pattern the architecture doc calls for, and it earns its
 * place here for three concrete reasons:
 *
 *  1. **Services stay testable without a database.** `AuthService` can be
 *     exercised against an in-memory fake, so its logic is verified in
 *     milliseconds rather than requiring a live Postgres.
 *  2. **The domain speaks its own language.** `findByEmail` rather than
 *     `prisma.user.findUnique({ where: { email } })` — business code reads
 *     as business, not as query construction.
 *  3. **Persistence detail stays contained.** Soft-delete filtering, the
 *     role-grant join, and transaction boundaries live in one adapter
 *     instead of leaking into every caller.
 *
 * It is NOT a generic `IRepository<T>` with `findAll`/`save`/`delete`. That
 * abstraction fits nothing in particular and forces callers back into
 * writing queries. Every method here exists because a specific use case
 * needs it.
 */

/** A user as the domain sees it — never the raw database row. */
export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly avatarUrl: string | null;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly roles: readonly UserRole[];
}

export interface CreateUserInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly phone?: string | undefined;
  /** Roles granted at creation. Registration grants RIDER. */
  readonly roles: readonly UserRole[];
}

/**
 * One page of the administrative directory.
 *
 * `query` matches name or email; `role` narrows. Both are optional and
 * independent — an administrator may browse everyone, search everyone,
 * filter to drivers, or search within drivers.
 */
export interface ListUsersFilter {
  readonly query?: string | undefined;
  readonly role?: UserRole | undefined;
  readonly limit: number;
  readonly cursor?: string | undefined;
}

export interface UserPageRecord {
  readonly users: readonly UserRecord[];
  readonly hasNextPage: boolean;
}

export interface UserRepository {
  /**
   * Find an active user by email.
   *
   * Returns null for a soft-deleted account: a deactivated user must not be
   * able to sign in, and the caller should not have to remember to filter.
   */
  findByEmail(email: string): Promise<UserRecord | null>;

  findById(id: string): Promise<UserRecord | null>;

  /**
   * Create a user and grant their initial roles atomically.
   *
   * One transaction, deliberately: a user row without its RIDER grant is an
   * account that exists but can do nothing, and would be invisible to every
   * role check while still occupying its email address.
   */
  create(input: CreateUserInput): Promise<UserRecord>;

  /** True when an account already holds this email, including soft-deleted. */
  existsByEmail(email: string): Promise<boolean>;

  /** Replace a stored hash — used by the transparent rehash on login. */
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;

  markEmailVerified(userId: string): Promise<void>;

  /**
   * Grant a role, idempotently.
   *
   * Returns the updated user, or `null` if no active user has that id.
   * Granting a role the user already holds is a no-op rather than an error:
   * the caller's intent — "this user should have this role" — is satisfied
   * either way, and an administrator clicking twice should not see a
   * failure.
   */
  grantRole(userId: string, role: UserRole): Promise<UserRecord | null>;

  /** Revoke a role, idempotently. Returns the updated user, or `null`. */
  revokeRole(userId: string, role: UserRole): Promise<UserRecord | null>;

  /**
   * One page of active users, newest first.
   *
   * Soft-deleted accounts are excluded like everywhere else. A directory
   * that listed them would offer an administrator a row whose every action
   * fails, because every other method already refuses to find it.
   */
  list(filter: ListUsersFilter): Promise<UserPageRecord>;
}

/**
 * Injection token.
 *
 * An interface has no runtime representation, so DI needs a concrete value
 * to key on. A `Symbol` cannot collide the way a string token can.
 */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
