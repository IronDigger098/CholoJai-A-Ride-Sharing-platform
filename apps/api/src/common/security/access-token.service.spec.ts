import { UserRole } from '@cholojai/shared';
import { describe, expect, it } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';

import { type AppConfigService } from '../../config/app-config.service';
import { makeTestConfig } from '../../testing/env.fixture';

import {
  AccessTokenService,
  accessTokenJwtOptions,
} from './access-token.service';

function makeService(config: AppConfigService = makeTestConfig()): {
  service: AccessTokenService;
  config: AppConfigService;
} {
  return {
    service: new AccessTokenService(
      new JwtService(accessTokenJwtOptions(config)),
      config,
    ),
    config,
  };
}

/** Assemble a JWT by hand, so tests can forge what a client cannot. */
function craftToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signature = '',
): string {
  const encode = (value: Record<string, unknown>): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode(header)}.${encode(payload)}.${signature}`;
}

describe('AccessTokenService', () => {
  const claims = { sub: 'user_1', roles: [UserRole.RIDER] };

  describe('sign and verify', () => {
    it('round-trips the claims it was given', () => {
      const { service } = makeService();

      const result = service.verify(service.sign(claims));

      expect(result.status).toBe('valid');
      expect(result).toMatchObject({ claims });
    });

    it('produces three dot-separated segments', () => {
      const { service } = makeService();
      expect(service.sign(claims).split('.')).toHaveLength(3);
    });

    it('does not encrypt — the payload is readable by anyone', () => {
      /* Not a defect; a JWT is signed, not sealed. This test exists so the
         property is stated somewhere rather than assumed, because the
         consequence is a rule: never put anything in a token that the
         bearer must not read. */
      const { service } = makeService();
      const [, payload] = service.sign(claims).split('.');

      const decoded: unknown = JSON.parse(
        Buffer.from(payload ?? '', 'base64url').toString('utf8'),
      );

      expect(decoded).toMatchObject({ sub: 'user_1' });
    });

    it('reports the configured lifetime', () => {
      const { service } = makeService();
      expect(service.ttlSeconds).toBe(15 * 60);
    });
  });

  describe('rejection', () => {
    it('rejects a token signed with a different secret', () => {
      const { service } = makeService();
      const attacker = makeService(
        makeTestConfig({
          JWT_ACCESS_SECRET: 'a-completely-different-secret-of-decent-length',
        }),
      );

      expect(service.verify(attacker.service.sign(claims)).status).toBe(
        'invalid',
      );
    });

    it('rejects a tampered payload', () => {
      // Escalating RIDER to ADMIN by editing the payload invalidates the
      // signature — which is the entire point of signing it.
      const { service } = makeService();
      const [header, , signature] = service.sign(claims).split('.');
      const forged = Buffer.from(
        JSON.stringify({ sub: 'user_1', roles: [UserRole.ADMIN] }),
      ).toString('base64url');

      expect(
        service.verify(`${header ?? ''}.${forged}.${signature ?? ''}`).status,
      ).toBe('invalid');
    });

    it('rejects the alg:none attack', () => {
      /* The classic JWT vulnerability: strip the signature, set the
         algorithm header to "none", and a library that trusts that header
         accepts the token as valid. `algorithms: ['HS256']` on the verify
         side is what stops it — this test fails the moment someone removes
         that allow-list. */
      const { service } = makeService();

      const forged = craftToken(
        { alg: 'none', typ: 'JWT' },
        {
          sub: 'user_1',
          roles: [UserRole.ADMIN],
          iss: 'cholojai-api',
          aud: 'cholojai-web',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      );

      expect(service.verify(forged).status).toBe('invalid');
    });

    it('reports an expired token as expired, not invalid', () => {
      // The distinction drives client behaviour: refresh silently versus
      // send the user back to the sign-in screen.
      const { service, config } = makeService(
        makeTestConfig({ JWT_ACCESS_TTL_MINUTES: '1' }),
      );

      const expired = new JwtService({
        ...accessTokenJwtOptions(config),
        signOptions: {
          ...accessTokenJwtOptions(config).signOptions,
          expiresIn: -10,
        },
      }).sign({ ...claims });

      expect(service.verify(expired).status).toBe('expired');
    });

    it('rejects a token minted for a different audience', () => {
      const { service, config } = makeService();

      const foreign = new JwtService({
        ...accessTokenJwtOptions(config),
        signOptions: {
          ...accessTokenJwtOptions(config).signOptions,
          audience: 'someone-elses-app',
        },
      }).sign({ ...claims });

      expect(service.verify(foreign).status).toBe('invalid');
    });

    it('rejects a correctly signed token with an unusable payload', () => {
      /* A signature proves origin, not shape. A token carrying no roles
         cannot authorise anything, and treating "we signed it" as "safe to
         use" is how an old or unrelated code path becomes a bypass. */
      const { service, config } = makeService();

      const signed = new JwtService(accessTokenJwtOptions(config)).sign({
        sub: 'user_1',
        roles: [],
      });

      expect(service.verify(signed).status).toBe('invalid');
    });

    it('rejects a role that is not one of ours', () => {
      const { service, config } = makeService();

      const signed = new JwtService(accessTokenJwtOptions(config)).sign({
        sub: 'user_1',
        roles: ['SUPERUSER'],
      });

      expect(service.verify(signed).status).toBe('invalid');
    });

    it('rejects garbage without throwing', () => {
      const { service } = makeService();

      for (const value of ['', 'not-a-token', 'a.b.c', '...']) {
        expect(service.verify(value).status).toBe('invalid');
      }
    });
  });
});
