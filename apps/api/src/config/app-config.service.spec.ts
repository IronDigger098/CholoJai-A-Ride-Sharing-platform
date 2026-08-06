import { describe, expect, it } from '@jest/globals';

import { AppConfigService } from './app-config.service';
import { type Env, parseEnv } from './env.schema';

function makeConfig(overrides: Record<string, string> = {}): AppConfigService {
  const env: Env = parseEnv({
    NODE_ENV: 'development',
    API_BASE_URL: 'http://localhost:4000',
    WEB_BASE_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://user:pw@localhost:5433/db',
    REDIS_URL: 'redis://localhost:6379',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    MAIL_FROM: 'CholoJai <no-reply@cholojai.local>',
    ...overrides,
  });
  return new AppConfigService(env);
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
});
