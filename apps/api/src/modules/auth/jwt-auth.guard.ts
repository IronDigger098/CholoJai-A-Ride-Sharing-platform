import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';

import { AccessTokenService } from '../../common/security/access-token.service';

import {
  AccessTokenExpiredError,
  InvalidAccessTokenError,
} from './auth.errors';
import { type AuthenticatedRequest } from './authenticated-request';

/** RFC 6750 §2.1 — the scheme is `Bearer`, one space, then the token. */
const BEARER_PREFIX = 'Bearer ';

/**
 * Requires a valid access token, and records who the caller is.
 *
 * A guard rather than middleware because Nest guards run inside the DI
 * container and inside the request lifecycle: they can inject services, and
 * anything they throw goes through the same problem-details filter as every
 * other error, so a 401 here has the identical body shape as a 404 from a
 * controller. Express middleware sits outside both.
 *
 * Applied per-controller rather than globally. A global guard with an
 * `@Public()` opt-out is the more common pattern, and it is the wrong
 * default for this codebase: forgetting the decorator on `/auth/login`
 * makes signing in impossible, which is loud, but forgetting to *remove*
 * one is silent. More to the point, this API is mostly public reads at the
 * edges (fare estimates, service areas) and mostly protected in the middle;
 * neither default is right often enough to trust, so protection is
 * declared where it applies and is visible in the file you are reading.
 *
 * The guard establishes *identity only*. Role checks are a separate
 * concern and arrive as `@Roles()` in M3.7 — authentication answers "who
 * are you", authorisation answers "may you", and collapsing them into one
 * decorator is how endpoints end up accidentally open to every signed-in
 * user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(private readonly accessTokens: AccessTokenService) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (token === null) {
      throw new InvalidAccessTokenError();
    }

    const result = this.accessTokens.verify(token);

    if (result.status === 'expired') {
      throw new AccessTokenExpiredError();
    }

    if (result.status === 'invalid') {
      throw new InvalidAccessTokenError();
    }

    /* The only place in the application that writes `request.user`. Every
       reader goes through `@CurrentUser()`, so there is exactly one line to
       audit if the question is ever "where does identity come from". */
    request.user = { id: result.claims.sub, roles: result.claims.roles };

    return true;
  }
}

/**
 * Pull the token out of an `Authorization` header.
 *
 * Deliberately strict. A tolerant parser — case-insensitive scheme, split
 * on any whitespace, accept a bare token with no scheme — is friendlier to
 * a developer with curl and friendlier to an attacker probing for a parser
 * that disagrees with the proxy in front of it. Being picky costs one
 * clear error message.
 */
function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  if (!header.startsWith(BEARER_PREFIX)) return null;

  const token = header.slice(BEARER_PREFIX.length).trim();

  return token.length === 0 ? null : token;
}
