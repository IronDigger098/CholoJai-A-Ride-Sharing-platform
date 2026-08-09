import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { InvalidAccessTokenError } from './auth.errors';
import {
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from './authenticated-request';

/**
 * Injects the authenticated caller into a handler parameter.
 *
 * ```ts
 * @UseGuards(JwtAuthGuard)
 * @Get('me')
 * public me(@CurrentUser() user: AuthenticatedUser) { … }
 * ```
 *
 * The return type is non-optional, which is the point: without this the
 * handler would have to read `request.user` and narrow away an `undefined`
 * that cannot occur behind the guard — and the temptation on a busy day is
 * to reach for `!` instead, which turns a missing `@UseGuards` into an
 * unauthenticated request handled as if it were authenticated.
 *
 * Throwing when the guard did not run means the failure mode of forgetting
 * `@UseGuards` is a 401, not a crash and not silent access. That is a
 * safety net, not a substitute: the guard is what enforces authentication,
 * and this only refuses to paper over its absence.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user === undefined) {
      throw new InvalidAccessTokenError();
    }

    return request.user;
  },
);
