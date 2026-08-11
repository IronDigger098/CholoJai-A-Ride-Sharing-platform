import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';

import { AccessTokenService } from '../../common/security/access-token.service';

import { type AuthenticatedRequest } from './authenticated-request';

/** RFC 6750 §2.1 — the scheme is `Bearer`, one space, then the token. */
const BEARER_PREFIX = 'Bearer ';

/**
 * Records who the caller is, and lets them through either way.
 *
 * For routes that are genuinely public but behave better when they know who
 * is calling. The contact form is the case it was written for: anyone may
 * write to support, and a message from a signed-in rider is worth linking to
 * their account.
 *
 * Never throws. A bad or expired token is treated exactly as no token —
 * which is the property that makes this safe to use and dangerous to
 * confuse with `JwtAuthGuard`. A route that needs identity must use `@Auth`;
 * this one *prefers* it. Anything that follows must treat `request.user` as
 * possibly absent and must never grant on the strength of it.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  public constructor(private readonly accessTokens: AccessTokenService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (header?.startsWith(BEARER_PREFIX) !== true) return true;

    const token = header.slice(BEARER_PREFIX.length).trim();

    if (token.length === 0) return true;

    const result = this.accessTokens.verify(token);

    if (result.status === 'valid') {
      request.user = { id: result.claims.sub, roles: result.claims.roles };
    }

    return true;
  }
}

/**
 * Identify the caller if they are signed in; admit them if they are not.
 *
 * `ApiBearerAuth` rides along so Swagger offers the token field, and the
 * absence of `ApiUnauthorizedResponse` is the documentation: there is no 401
 * on a route wearing this decorator.
 */
export const OptionalAuth = (): MethodDecorator & ClassDecorator =>
  applyDecorators(UseGuards(OptionalAuthGuard), ApiBearerAuth('access-token'));
