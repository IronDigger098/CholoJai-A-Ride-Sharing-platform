import { hasAnyRole, type UserRole } from '@cholojai/shared';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { InsufficientPermissionError } from '../../common/errors/domain-error';

import { InvalidAccessTokenError } from './auth.errors';
import { type AuthenticatedRequest } from './authenticated-request';
import { ROLES_KEY } from './roles.decorator';

/**
 * Checks that the caller holds one of the roles a route requires.
 *
 * Strictly separate from `JwtAuthGuard`, which answers "who are you". This
 * one answers "may you", and the two failures are different HTTP responses
 * for a reason: 401 tells a client to obtain credentials and retry, while
 * 403 tells it that retrying is pointless. Collapsing them into one status
 * makes a client either loop on a permission error or give up on a fixable
 * one.
 *
 * ## Containment, not hierarchy
 *
 * `hasAnyRole` treats roles as a flat set. An ADMIN is *not* implicitly a
 * DRIVER. Role hierarchies feel tidy and are a common source of accidental
 * privilege: the moment ADMIN implies DRIVER, an administrator can accept
 * ride requests and appear in driver matching, which is not a capability
 * anyone intended to grant. If an admin needs to drive, they get a DRIVER
 * grant like anyone else — decision D1, one account with additive roles.
 *
 * ## Fails closed
 *
 * If a route declares `@Roles()` but no authentication guard ran, there is
 * no `request.user` and this raises 401 rather than waving the request
 * through. That path should be unreachable — `@Auth()` applies both guards
 * together — but "unreachable" is a claim about today's code, and the cost
 * of being wrong about it is an open admin endpoint.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      readonly UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // No roles declared means authentication only — this guard has nothing
    // to say, and saying nothing is not the same as denying.
    if (required === undefined || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (user === undefined) throw new InvalidAccessTokenError();

    if (!hasAnyRole(user.roles, required)) {
      /* The message names neither the role required nor the roles held.
         Telling a rider that an endpoint wants ADMIN maps the privilege
         model for anyone probing, and a legitimate user cannot act on the
         information anyway — they cannot grant themselves a role. */
      throw new InsufficientPermissionError();
    }

    return true;
  }
}
