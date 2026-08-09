import { describe, expect, it } from '@jest/globals';

import { makeTestConfig } from '../../testing/env.fixture';

import { logLevelsFor } from './prisma.service';

/**
 * Only the logging policy is tested here.
 *
 * `PrismaService` itself is a thin subclass whose behaviour is Prisma's; the
 * adapters that use it are covered by the integration suites against a real
 * database. What is worth pinning down is the one decision this file
 * actually makes, and which nothing else would notice going wrong.
 */
describe('logLevelsFor', () => {
  const production = {
    NODE_ENV: 'production',
    API_BASE_URL: 'https://api.cholojai.app',
    WEB_BASE_URL: 'https://cholojai.app',
    JWT_ACCESS_SECRET: 'a-real-production-secret-of-sufficient-length',
  };

  it('logs every statement in development', () => {
    // The reason this setting exists: an accidental N+1 is invisible in
    // code review and obvious as twenty identical SELECTs.
    expect(logLevelsFor(makeTestConfig({ NODE_ENV: 'development' }))).toContain(
      'query',
    );
  });

  it('never logs statements in production', () => {
    /* Query parameters carry addresses, names, and token hashes. A log
       shipped to an aggregator is a copy of the database's most sensitive
       columns in a system with different access controls. */
    expect(logLevelsFor(makeTestConfig(production)).includes('query')).toBe(
      false,
    );
  });

  it('never logs statements under test', () => {
    /* Not a privacy concern here but a legibility one. The integration
       suites run hundreds of statements against a real database, and with
       `query` on, CI printed 2,198 lines of SQL for 34 assertions — enough
       to bury the failure someone opened the log to read. */
    expect(logLevelsFor(makeTestConfig()).includes('query')).toBe(false);
  });

  it('still reports warnings and errors outside production', () => {
    // Silencing the noise must not silence the signal.
    expect(logLevelsFor(makeTestConfig())).toEqual(['warn', 'error']);
  });
});
