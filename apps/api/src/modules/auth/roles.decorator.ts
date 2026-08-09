import { type UserRole } from '@cholojai/shared';
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

export const ROLES_KEY = 'auth:roles';

/**
 * Declare which roles may call a route.
 *
 * Exported for composition, but prefer `@Auth()` — this decorator alone
 * records a requirement without installing anything to enforce it.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Shorthand for the shared error schema in Swagger responses. */
const PROBLEM_DETAILS = {
  schema: { $ref: '#/components/schemas/ProblemDetails' },
} as const;

/**
 * Protect a route: authenticate, then authorise.
 *
 * ```ts
 * @Auth()                    // any signed-in user
 * @Auth(UserRole.ADMIN)      // admins only
 * @Auth(UserRole.DRIVER, UserRole.ADMIN)   // either
 * ```
 *
 * This exists because the two-decorator form is a trap. Written out, a
 * protected route needs `@UseGuards(JwtAuthGuard, RolesGuard)` *and*
 * `@Roles(...)` *and* `@ApiBearerAuth()`, in the right order — and the
 * failure mode of forgetting a piece is silent. `@Roles(ADMIN)` without the
 * guards records a requirement nothing enforces: the route reads as
 * protected and is wide open. `RolesGuard` fails closed to cover that, but
 * the better answer is an API where the mistake cannot be expressed.
 *
 * Order matters and is fixed here: `JwtAuthGuard` must populate
 * `request.user` before `RolesGuard` reads it. Nest runs guards in the
 * order given, so this is the one place that ordering has to be right.
 *
 * The Swagger annotations ride along because they describe consequences of
 * the same decision. Documentation that has to be repeated by hand on every
 * protected route is documentation that will disagree with the code.
 */
export const Auth = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(...roles),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({
      description:
        'No access token, or one that is invalid or expired. `code` ' +
        'distinguishes `ACCESS_TOKEN_EXPIRED` — refresh and retry — from ' +
        '`INVALID_ACCESS_TOKEN`, which means sign in again.',
      ...PROBLEM_DETAILS,
    }),
    ApiForbiddenResponse({
      description:
        'Signed in, but without a role this endpoint requires. Retrying ' +
        'will not help.',
      ...PROBLEM_DETAILS,
    }),
  );
