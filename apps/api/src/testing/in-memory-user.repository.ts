import { type UserRole } from '@cholojai/shared';

import {
  type CreateUserInput,
  type ListUsersFilter,
  type UserPageRecord,
  type UserRecord,
  type UserRepository,
} from '../modules/users/user-repository.port';

/**
 * An in-memory stand-in for the users table.
 *
 * Shared rather than copied into each suite. Two private copies had already
 * drifted apart — one could create users and the other threw — and the day
 * the port grew `grantRole` and `revokeRole`, both had to be found and
 * fixed. A fake that lags the interface it implements is a test suite that
 * passes while the real adapter is broken.
 *
 * It reproduces the behaviours callers actually depend on, including the
 * one that matters most: `findById` and `findByEmail` hide soft-deleted
 * accounts, exactly as the Prisma adapter's `deletedAt: null` filter does.
 * A fake that is more permissive than production quietly proves the wrong
 * thing.
 */
export class InMemoryUserRepository implements UserRepository {
  public readonly rows: UserRecord[] = [];
  private nextId = 1;

  /** Soft-deleted ids. The port has no delete yet; tests set this directly. */
  public readonly deactivated = new Set<string>();

  public constructor(seed: UserRecord[] = []) {
    this.rows.push(...seed);
  }

  public async findByEmail(email: string): Promise<UserRecord | null> {
    return this.active().find((row) => row.email === email) ?? null;
  }

  public async findById(id: string): Promise<UserRecord | null> {
    return this.active().find((row) => row.id === id) ?? null;
  }

  /** Includes soft-deleted accounts: the email column stays occupied. */
  public async existsByEmail(email: string): Promise<boolean> {
    return this.rows.some((row) => row.email === email);
  }

  public async create(input: CreateUserInput): Promise<UserRecord> {
    const record: UserRecord = {
      id: `user_${this.nextId++}`,
      email: input.email,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      phone: input.phone ?? null,
      avatarUrl: null,
      emailVerifiedAt: null,
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      roles: [...input.roles],
    };

    this.rows.push(record);
    return record;
  }

  public async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    this.patch(userId, (row) => ({ ...row, passwordHash }));
  }

  /**
   * Apply only the named fields.
   *
   * The `undefined` checks mirror the adapter's spread guards rather than
   * being defensive noise: `{ phone: undefined }` must leave a number
   * alone, and a fake that overwrote it with `undefined` would let a test
   * pass against a service that silently wipes data.
   */
  public async updateProfile(
    userId: string,
    input: {
      readonly fullName?: string | undefined;
      readonly phone?: string | null | undefined;
      readonly avatarUrl?: string | null | undefined;
    },
  ): Promise<UserRecord | null> {
    if (!this.rows.some((row) => row.id === userId)) return null;

    this.patch(userId, (row) => ({
      ...row,
      ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
    }));

    return this.findById(userId);
  }

  public async markEmailVerified(userId: string): Promise<void> {
    this.patch(userId, (row) => ({ ...row, emailVerifiedAt: new Date() }));
  }

  public async grantRole(
    userId: string,
    role: UserRole,
  ): Promise<UserRecord | null> {
    if ((await this.findById(userId)) === null) return null;

    // Idempotent, like the upsert in the real adapter.
    this.patch(userId, (row) =>
      row.roles.includes(role) ? row : { ...row, roles: [...row.roles, role] },
    );

    return this.findById(userId);
  }

  public async revokeRole(
    userId: string,
    role: UserRole,
  ): Promise<UserRecord | null> {
    if ((await this.findById(userId)) === null) return null;

    this.patch(userId, (row) => ({
      ...row,
      roles: row.roles.filter((held) => held !== role),
    }));

    return this.findById(userId);
  }

  /**
   * Filtered, sorted, and sliced the way the Prisma adapter does.
   *
   * A fake that returned insertion order would let a pagination bug pass
   * here and fail in production, which is the failure mode this whole file
   * exists to prevent.
   */
  public async list(filter: ListUsersFilter): Promise<UserPageRecord> {
    const matches = this.active()
      .filter((row) => matchesQuery(row, filter.query))
      .filter(
        (row) => filter.role === undefined || row.roles.includes(filter.role),
      )
      .sort(newestFirst);

    /* An unknown cursor restarts from the top. The real adapter throws;
       neither matters, because a cursor only goes missing if the row it
       named was deleted between two pages. */
    const start =
      filter.cursor === undefined
        ? 0
        : matches.findIndex((row) => row.id === filter.cursor) + 1;

    return {
      users: matches.slice(start, start + filter.limit),
      hasNextPage: matches.length > start + filter.limit,
    };
  }

  private active(): UserRecord[] {
    return this.rows.filter((row) => !this.deactivated.has(row.id));
  }

  private patch(userId: string, change: (row: UserRecord) => UserRecord): void {
    const index = this.rows.findIndex((row) => row.id === userId);
    const existing = this.rows[index];

    if (existing !== undefined) this.rows[index] = change(existing);
  }
}

/** Case-insensitive across name and email, like the adapter's OR clause. */
function matchesQuery(row: UserRecord, query: string | undefined): boolean {
  if (query === undefined) return true;

  const needle = query.toLowerCase();

  return (
    row.fullName.toLowerCase().includes(needle) ||
    row.email.toLowerCase().includes(needle)
  );
}

/** Newest first, with `id` breaking ties — the adapter's `orderBy`. */
function newestFirst(left: UserRecord, right: UserRecord): number {
  const byDate = right.createdAt.getTime() - left.createdAt.getTime();

  return byDate === 0 ? right.id.localeCompare(left.id) : byDate;
}
