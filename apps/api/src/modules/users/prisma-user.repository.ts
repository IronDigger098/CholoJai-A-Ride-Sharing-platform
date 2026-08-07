import { type UserRole } from '@cholojai/shared';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import {
  type CreateUserInput,
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
