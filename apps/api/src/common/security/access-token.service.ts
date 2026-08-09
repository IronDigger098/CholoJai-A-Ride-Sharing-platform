import { UserRole } from '@cholojai/shared';
import { Injectable } from '@nestjs/common';
import { JwtService, type JwtModuleOptions } from '@nestjs/jwt';
import { z } from 'zod';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Signing and verification options, derived from configuration.
 *
 * Exported so that `AuthModule` and the tests build them from one function
 * instead of two similar object literals. A test that verifies "an
 * `alg: none` token is rejected" proves nothing if its own JWT setup is a
 * copy that happens to pin the algorithm while the application's does not.
 *
 * `algorithms: ['HS256']` on the verify side is the security-critical
 * line. Without an allow-list, `jsonwebtoken` honours the `alg` header of
 * whatever token it is handed — so an attacker sets `alg: none`, drops the
 * signature, and is admitted. Pinning makes that header advisory rather
 * than authoritative. `issuer` and `audience` are enforced in both
 * directions, so a token minted by another service that happens to share
 * this secret cannot be replayed here.
 */
export function accessTokenJwtOptions(
  config: AppConfigService,
): JwtModuleOptions {
  const { secret, ttlSeconds, issuer, audience } = config.accessToken;

  return {
    secret,
    signOptions: {
      algorithm: 'HS256',
      expiresIn: ttlSeconds,
      issuer,
      audience,
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer,
      audience,
    },
  };
}

/**
 * The claims we put in an access token, and the only ones we trust.
 *
 * A signature proves a token was minted by us and has not been altered. It
 * proves nothing about its *shape* — a token issued by an older build of
 * this service is perfectly valid and may carry claims that no longer
 * exist, or lack ones we now depend on. So the decoded payload is parsed
 * like any other untrusted input.
 *
 * `sub` and `roles` are the whole payload, deliberately. Every claim added
 * here is copied into every request from every client for the token's
 * lifetime, and is *stale* for that lifetime — a role revoked at 10:00
 * keeps working until 10:15. Fifteen minutes of staleness is an acceptable
 * price for skipping a database round trip on every authenticated request;
 * fifteen minutes of a stale *email address* would buy nothing, so it is
 * not here.
 */
const accessTokenClaimsSchema = z.object({
  /** Subject — the user id. The registered claim name, not a custom one. */
  sub: z.string().min(1),
  roles: z.array(z.nativeEnum(UserRole)).min(1),
});

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

/**
 * The outcome of checking a token.
 *
 * A discriminated union rather than thrown exceptions, and rather than a
 * bare `AccessTokenClaims | null`. Two reasons: `expired` and `invalid`
 * lead to different responses and must not collapse into one another, and
 * this keeps a `common/security` primitive free of any knowledge of HTTP
 * status codes or domain errors. The guard decides what a failure *means*;
 * this class only decides what is true.
 */
export type AccessTokenVerification =
  | { readonly status: 'valid'; readonly claims: AccessTokenClaims }
  | { readonly status: 'expired' }
  | { readonly status: 'invalid' };

/**
 * Mints and validates the short-lived bearer token.
 *
 * The signing algorithm is pinned to HS256 on both sides. Pinning on
 * *verification* is the part that matters: `jsonwebtoken` will otherwise
 * honour the `alg` header of the token it was handed, and an attacker who
 * sets `alg: none` — or swaps HS256 for RS256 so our public key is treated
 * as an HMAC secret — walks straight in. Algorithm confusion is the classic
 * JWT vulnerability, and an allow-list is the entire fix.
 */
@Injectable()
export class AccessTokenService {
  public constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /** Seconds until a freshly issued token expires. */
  public get ttlSeconds(): number {
    return this.config.accessToken.ttlSeconds;
  }

  /**
   * Issue a token for a user.
   *
   * `expiresIn`, `issuer`, and `audience` come from the module's signing
   * options rather than being passed here, so there is no call site that
   * can accidentally mint a token that lives for a year.
   */
  public sign(claims: AccessTokenClaims): string {
    return this.jwt.sign({ sub: claims.sub, roles: [...claims.roles] });
  }

  /**
   * Check a token's signature, registered claims, and payload shape.
   *
   * Note that a payload which passes the signature check can still come
   * back `invalid`: a correctly signed token carrying `roles: []`, or no
   * `sub` at all, is not something this application can act on, and
   * treating "signed by us" as "safe to use" is how a token minted by an
   * older or unrelated code path becomes an authorisation bypass.
   */
  public verify(token: string): AccessTokenVerification {
    let payload: unknown;

    try {
      /* Typed as `object` because that is what the library's generic
         accepts, then immediately widened to `unknown` — the value is
         attacker-supplied and gets parsed below, not read directly. */
      payload = this.jwt.verify<object>(token);
    } catch (error: unknown) {
      /* Matched by name rather than `instanceof TokenExpiredError`.
         `jsonwebtoken` is a transitive dependency of @nestjs/jwt, not one
         this package declares, and importing from a dependency we do not
         own a version range for is how a silent breakage arrives during an
         upgrade. The `name` property is part of its documented API. */
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        return { status: 'expired' };
      }
      return { status: 'invalid' };
    }

    const parsed = accessTokenClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      return { status: 'invalid' };
    }

    return { status: 'valid', claims: parsed.data };
  }
}
