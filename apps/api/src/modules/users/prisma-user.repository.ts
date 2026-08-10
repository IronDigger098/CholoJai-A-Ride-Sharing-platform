import { type UserRole } from '@cholojai/shared';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateUserInput,
  type ListUsersFilter,
  type UserPageRecord,
  type UserRecord,
  type UserRepository,
} from './user-repository.port';

/**
 * PostgreSQL adapter for {@link UserRepository}.
 *
 * The only file in the users feature that knows Prisma exists. Everything
 * about persistence lives here: the role-grant join, soft-delete filtering,
 * and transaction boundaries. Swapping the ORM would mean rewriting this
 * file and nothing else.
 */
@Injectable()
export class PrismaUserRepository implements UserRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findFirst({
      // `deletedAt: null` on every read. A deactivated account must not be
      // able to sign in, and filtering here means no caller can forget.
      where: { email, deletedAt: null },
      include: { roleGrants: true },
    });

    return row === null ? null : toUserRecord(row);
  }

  public async findById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roleGrants: true },
    });

    return row === null ? null : toUserRecord(row);
  }

  /**
   * Include soft-deleted accounts deliberately.
   *
   * The email column is uniquely indexed regardless of `deletedAt`, so a
   * deactivated account still occupies its address. Ignoring that here
   * would let registration pass its own check and then fail on the database
   * constraint — a 500 where a clear 409 belongs.
   */
  public async existsByEmail(email: string): Promise<boolean> {
    const found = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Create the user and its role grants in one transaction.
   *
   * A user row without its RIDER grant is an account that exists but can do
   * nothing — invisible to every role check while still holding its email
   * address. Prisma's nested create runs both in a single statement group,
   * so either both land or neither does.
   */
  public async create(input: CreateUserInput): Promise<UserRecord> {
    const row = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        phone: input.phone ?? null,
        roleGrants: {
          create: input.roles.map((role) => ({ role })),
        },
      },
      include: { roleGrants: true },
    });

    return toUserRecord(row);
  }

  public async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  public async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /**
   * Grant a role.
   *
   * `INSERT … ON CONFLICT DO NOTHING` against the `(user_id, role)` unique
   * index, rather than a read-then-insert: two administrators acting at the
   * same moment would both see "not granted yet", and the second insert
   * would surface as a constraint violation — a 500 for a request that
   * wanted something already true. Letting the database resolve the
   * collision turns a race into a no-op.
   *
   * The existence check runs first and filters soft-deleted accounts, so a
   * deactivated user cannot quietly be handed a role.
   */
  public async grantRole(
    userId: string,
    role: UserRole,
  ): Promise<UserRecord | null> {
    if ((await this.findById(userId)) === null) return null;

    /* `createMany` with `skipDuplicates`, not `upsert`. Both express "grant
       it if it is not already granted", but they compile differently:
       this one is `ON CONFLICT DO NOTHING`, while `upsert` takes the
       `DO UPDATE` branch and locks the conflicting row to write an empty
       update to it. Two concurrent grants of the same role then contend for
       that lock — which is how the "two administrators at the same moment"
       integration test failed once in CI and never once locally. Saying
       "do nothing" precisely leaves nothing to contend on. */
    await this.prisma.roleGrant.createMany({
      data: [{ userId, role }],
      skipDuplicates: true,
    });

    return this.findById(userId);
  }

  /**
   * Revoke a role.
   *
   * `deleteMany` rather than `delete`, because deleting a row that is not
   * there throws in Prisma — and revoking a role the user never held is a
   * request whose intent is already satisfied.
   */
  public async revokeRole(
    userId: string,
    role: UserRole,
  ): Promise<UserRecord | null> {
    if ((await this.findById(userId)) === null) return null;

    await this.prisma.roleGrant.deleteMany({ where: { userId, role } });

    return this.findById(userId);
  }

  /**
   * One page of the directory.
   *
   * `take: limit + 1` asks for one row more than the caller wants. Its
   * presence is what "there is a next page" means — the alternative is a
   * second `COUNT(*)` over the same predicate, which doubles the work to
   * answer a question a single extra row already answers.
   *
   * `id` is a tiebreak on the sort, not decoration. Cursor pagination needs
   * a total order: two accounts created in the same millisecond could
   * otherwise swap places between requests, and the reader would see one
   * twice and never see the other.
   *
   * The search is `contains`, so it cannot use an index and never will.
   * That is a deliberate limit rather than an oversight — matching a
   * fragment anywhere in a name is what an administrator means by search,
   * and the honest fix when this table is large is a text search index, not
   * a prefix match that stops finding people.
   */
  public async list(filter: ListUsersFilter): Promise<UserPageRecord> {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(filter.role === undefined
          ? {}
          : { roleGrants: { some: { role: filter.role } } }),
        ...(filter.query === undefined
          ? {}
          : {
              OR: [
                { fullName: { contains: filter.query, mode: 'insensitive' } },
                { email: { contains: filter.query, mode: 'insensitive' } },
              ],
            }),
      },
      include: { roleGrants: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
      ...(filter.cursor === undefined
        ? {}
        : { cursor: { id: filter.cursor }, skip: 1 }),
    });

    return {
      users: rows.slice(0, filter.limit).map(toUserRecord),
      hasNextPage: rows.length > filter.limit,
    };
  }
}

/** Shape of the Prisma row this adapter reads. */
interface UserRowWithRoles {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  roleGrants: { role: string }[];
}

/**
 * Translate a database row into the domain's `UserRecord`.
 *
 * The boundary where persistence shape stops and domain shape begins:
 * grants become a flat role array, and columns the domain has no business
 * seeing simply are not carried across.
 */
function toUserRecord(row: UserRowWithRoles): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    roles: row.roleGrants.map((grant) => grant.role as UserRole),
  };
}
