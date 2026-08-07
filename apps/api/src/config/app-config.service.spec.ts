import { describe, expect, it } from '@jest/globals';

import { makeTestConfig } from '../testing/env.fixture';

import { type AppConfigService } from './app-config.service';

/** The shared fixture, defaulted to development for these assertions. */
function makeConfig(overrides: Record<string, string> = {}): AppConfigService {
  return makeTestConfig({ NODE_ENV: 'development', ...overrides });
}

describe('AppConfigService', () => {
  it('exposes typed runtime values', () => {
    const config = makeConfig();
    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('info');
  });

  it('reports the environment correctly', () => {
    expect(makeConfig().isProduction).toBe(false);
    expect(makeConfig({ NODE_ENV: 'test' }).isTest).toBe(true);
    expect(
      makeConfig({
        NODE_ENV: 'production',
        API_BASE_URL: 'https://api.cholojai.app',
        WEB_BASE_URL: 'https://cholojai.app',
      }).isProduction,
    ).toBe(true);
  });

  it('groups mail settings into one object', () => {
    expect(makeConfig().mail).toEqual({
      host: 'localhost',
      port: 1025,
      from: 'CholoJai <no-reply@cholojai.local>',
    });
  });

  it('never returns a wildcard CORS origin', () => {
    // `origin: '*'` with credentials is both rejected by browsers and a
    // security hole. The allow-list must always be explicit.
    const origins = makeConfig().corsOrigins;
    expect(origins).toEqual(['http://localhost:3000']);
    expect(origins).not.toContain('*');
  });

  it('converts the access-token lifetime from minutes to seconds', () => {
    // The environment is expressed in the unit a human reasons about;
    // `jsonwebtoken` wants seconds. Converting in one getter beats
    // remembering to multiply at each call site.
    const token = makeConfig({ JWT_ACCESS_TTL_MINUTES: '20' }).accessToken;

    expect(token.ttlSeconds).toBe(1200);
    expect(token.issuer).toBe('cholojai-api');
    expect(token.audience).toBe('cholojai-web');
    expect(token.secret.length).toBeGreaterThanOrEqual(32);
  });

  describe('refreshCookie', () => {
    it('is httpOnly, SameSite=Strict, and scoped to the auth path', () => {
      /* Each of these is load-bearing. `httpOnly` is what an XSS payload
         cannot get past; `sameSite: strict` is what closes the CSRF hole
         that cookie authentication would otherwise open; the path is what
         stops the browser attaching the cookie to every other endpoint. */
      const cookie = makeConfig().refreshCookie;

      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe('strict');
      expect(cookie.path).toBe('/api/v1/auth');
    });

    it('requires HTTPS in production and not before', () => {
      // `secure` on plain http in development means the browser silently
      // drops the cookie and sign-in appears to fail for no visible reason.
      expect(makeConfig().refreshCookie.secure).toBe(false);
      expect(
        makeConfig({
          NODE_ENV: 'production',
          API_BASE_URL: 'https://api.cholojai.app',
          WEB_BASE_URL: 'https://cholojai.app',
          JWT_ACCESS_SECRET: 'a-real-looking-production-secret-value-here',
        }).refreshCookie.secure,
      ).toBe(true);
    });

    it('expires with the token it carries', () => {
      // A cookie that outlives its token leaves the browser sending a dead
      // credential; one that dies first signs the user out early.
      const cookie = makeConfig({ REFRESH_TTL_DAYS: '7' }).refreshCookie;
      expect(cookie.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});
