import { UserRole } from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';
import { type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  AccessTokenService,
  accessTokenJwtOptions,
} from '../../common/security/access-token.service';
import { makeTestConfig } from '../../testing/env.fixture';

import {
  AccessTokenExpiredError,
  InvalidAccessTokenError,
} from './auth.errors';
import { type AuthenticatedRequest } from './authenticated-request';
import { JwtAuthGuard } from './jwt-auth.guard';

const config = makeTestConfig();

function makeGuard(): { guard: JwtAuthGuard; tokens: AccessTokenService } {
  const tokens = new AccessTokenService(
    new JwtService(accessTokenJwtOptions(config)),
    config,
  );

  return { guard: new JwtAuthGuard(tokens), tokens };
}

/**
 * The smallest thing that behaves like an `ExecutionContext`.
 *
 * Building one by hand rather than booting a Nest testing module keeps this
 * suite measuring the guard's own logic — header parsing and the branch on
 * each verification outcome — instead of the framework's wiring.
 */
function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function requestWith(authorization?: string): AuthenticatedRequest {
  return {
    headers: authorization === undefined ? {} : { authorization },
  } as AuthenticatedRequest;
}

describe('JwtAuthGuard', () => {
  const claims = { sub: 'user_1', roles: [UserRole.RIDER] };

  it('admits a valid token and records who the caller is', () => {
    const { guard, tokens } = makeGuard();
    const request = requestWith(`Bearer ${tokens.sign(claims)}`);

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toEqual({ id: 'user_1', roles: [UserRole.RIDER] });
  });

  it('rejects a request with no Authorization header', () => {
    const { guard } = makeGuard();

    expect(() => guard.canActivate(contextFor(requestWith()))).toThrow(
      InvalidAccessTokenError,
    );
  });

  it('rejects a token with no scheme', () => {
    const { guard, tokens } = makeGuard();

    expect(() =>
      guard.canActivate(contextFor(requestWith(tokens.sign(claims)))),
    ).toThrow(InvalidAccessTokenError);
  });

  it('rejects schemes other than Bearer', () => {
    /* Strict on purpose. A parser that accepts `bearer`, `BEARER`, or Basic
       auth is friendlier to curl and friendlier to anyone probing for a
       disagreement between this and the proxy in front of it. */
    const { guard, tokens } = makeGuard();
    const token = tokens.sign(claims);

    for (const header of [
      `bearer ${token}`,
      `Basic ${token}`,
      `Bearer  ${token}`.replace('Bearer', 'Bearer!'),
    ]) {
      expect(() => guard.canActivate(contextFor(requestWith(header)))).toThrow(
        InvalidAccessTokenError,
      );
    }
  });

  it('rejects an empty bearer token', () => {
    const { guard } = makeGuard();

    expect(() =>
      guard.canActivate(contextFor(requestWith('Bearer    '))),
    ).toThrow(InvalidAccessTokenError);
  });

  it('rejects a forged token', () => {
    const { guard } = makeGuard();
    const attacker = new AccessTokenService(
      new JwtService(
        accessTokenJwtOptions(
          makeTestConfig({
            JWT_ACCESS_SECRET: 'a-completely-different-secret-of-decent-length',
          }),
        ),
      ),
      config,
    );

    expect(() =>
      guard.canActivate(
        contextFor(requestWith(`Bearer ${attacker.sign(claims)}`)),
      ),
    ).toThrow(InvalidAccessTokenError);
  });

  it('distinguishes an expired token from an invalid one', () => {
    /* Different codes because the client's correct reaction differs:
       expired means refresh silently, invalid means sign in again. Collapse
       them and the app logs people out every fifteen minutes. */
    const { guard } = makeGuard();

    const expired = new JwtService({
      ...accessTokenJwtOptions(config),
      signOptions: {
        ...accessTokenJwtOptions(config).signOptions,
        expiresIn: -10,
      },
    }).sign({ ...claims });

    expect(() =>
      guard.canActivate(contextFor(requestWith(`Bearer ${expired}`))),
    ).toThrow(AccessTokenExpiredError);
  });

  it('does not annotate the request when it rejects', () => {
    // A handler reached by mistake must not find an identity waiting.
    const { guard } = makeGuard();
    const request = requestWith('Bearer nonsense');

    expect(() => guard.canActivate(contextFor(request))).toThrow();
    expect(request.user).toBeUndefined();
  });
});
