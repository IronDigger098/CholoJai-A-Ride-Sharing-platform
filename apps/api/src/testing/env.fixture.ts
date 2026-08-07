import { AppConfigService } from '../config/app-config.service';
import { type Env, parseEnv } from '../config/env.schema';

/**
 * A validated configuration for unit tests.
 *
 * Built by running the *real* schema over a plain object rather than by
 * hand-constructing an `Env`. That matters more than it looks: a fixture
 * assembled by hand can hold a combination the schema would reject, so
 * tests keep passing against a configuration production could never have.
 * Here, adding a required variable breaks every test until the fixture is
 * updated — which is the correct amount of friction.
 *
 * Nothing reads `process.env`, so tests stay isolated and parallel-safe.
 */
export function makeTestEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    API_BASE_URL: 'http://localhost:4000',
    WEB_BASE_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'test-only-access-secret-thirty-two-chars-min',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    MAIL_FROM: 'CholoJai <no-reply@cholojai.local>',
    ...overrides,
  });
}

/** The same fixture wrapped in the service most tests actually inject. */
export function makeTestConfig(
  overrides: Record<string, string> = {},
): AppConfigService {
  return new AppConfigService(makeTestEnv(overrides));
}
