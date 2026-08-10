import {
  type RoleChangeResponse,
  type UserListQuery,
  type UserPage,
  UserRole,
} from '@cholojai/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ResourceNotFoundError } from '../../common/errors/domain-error';
import { toUserSummary } from '../auth/auth.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../users/user-repository.port';

import {
  CannotRevokeOwnAdminRoleError,
  CannotRevokeRiderRoleError,
} from './admin.errors';

/**
 * Administrative operations on other people's accounts.
 *
 * A separate module from `users` on purpose. The operations here are
 * defined by *who is asking* rather than by what they touch: "change my own
 * password" and "change someone else's role" both write to a user, and
 * grouping them by table would put the platform's most sensitive endpoints
 * in the same file as its most routine ones. Grouping by privilege keeps
 * the blast radius of a missing guard visible.
 *
 * Every method here logs the actor as well as the subject. For ordinary
 * features a log line naming the user is enough; for privilege changes the
 * question asked six months later is always "who did this", and an audit
 * trail that records only the effect cannot answer it.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  public constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /**
   * Grant a role to a user.
   *
   * Idempotent, and note what is *not* checked: whether the target is
   * already a driver, whether they have a driver profile, whether their
   * email is verified. Those are the concerns of the driver-application
   * flow in M7. This endpoint is the low-level mechanism that flow will
   * eventually call, and the escape hatch an operator needs when it fails.
   */
  public async grantRole(
    actorId: string,
    targetUserId: string,
    role: UserRole,
  ): Promise<RoleChangeResponse> {
    const user = await this.users.grantRole(targetUserId, role);

    if (user === null) throw new ResourceNotFoundError('user', targetUserId);

    this.logger.log(`Admin ${actorId} granted ${role} to user ${user.id}`);

    return { user: toUserSummary(user) };
  }

  /**
   * Revoke a role from a user.
   *
   * Two refusals, both protecting an invariant rather than a permission —
   * see `admin.errors.ts` for why blocking self-revocation is sufficient to
   * guarantee the platform never runs out of administrators.
   *
   * A demotion does not need to revoke the user's sessions. Access tokens
   * carry roles and are stale for at most their lifetime, and
   * `/auth/refresh` re-reads roles from the database — so the change takes
   * effect on the next refresh without any extra machinery. That is a
   * property M3.5 bought us; it is worth knowing it is load-bearing here,
   * because a future "refresh from claims" optimisation would silently make
   * demotion permanent-until-signout.
   */
  public async revokeRole(
    actorId: string,
    targetUserId: string,
    role: UserRole,
  ): Promise<RoleChangeResponse> {
    if (role === UserRole.RIDER) throw new CannotRevokeRiderRoleError();

    if (role === UserRole.ADMIN && actorId === targetUserId) {
      throw new CannotRevokeOwnAdminRoleError();
    }

    const user = await this.users.revokeRole(targetUserId, role);

    if (user === null) throw new ResourceNotFoundError('user', targetUserId);

    this.logger.warn(`Admin ${actorId} revoked ${role} from user ${user.id}`);

    return { user: toUserSummary(user) };
  }

  /**
   * One page of the user directory.
   *
   * Not logged, unlike every other method here. The audit trail exists to
   * answer "who changed this account"; recording that an administrator
   * looked at a list would bury those entries under thousands that record
   * nothing having happened.
   *
   * The cursor is the last row's id rather than an encoded offset. That is
   * what makes it stable under writes: it names a row, and the next page is
   * whatever sorts after that row now — not whatever currently sits at
   * position 20. `nextCursor` is null unless a next page genuinely exists,
   * so a client can stop on the cursor alone.
   */
  public async listUsers(query: UserListQuery): Promise<UserPage> {
    const page = await this.users.list({
      limit: query.limit,
      ...(query.q === undefined ? {} : { query: query.q }),
      ...(query.role === undefined ? {} : { role: query.role }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });

    const data = page.users.map(toUserSummary);

    return {
      data,
      pageInfo: {
        nextCursor: page.hasNextPage ? (data.at(-1)?.id ?? null) : null,
        hasNextPage: page.hasNextPage,
      },
    };
  }
}
