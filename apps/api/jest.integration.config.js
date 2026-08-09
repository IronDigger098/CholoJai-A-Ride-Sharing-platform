/**
 * Integration tests: the suites that need a real PostgreSQL.
 *
 * A separate config, and separate `*.int-spec.ts` filenames, so the ordinary
 * `pnpm test` stays fast and needs no infrastructure. The default config
 * matches `**\/*.spec.ts`, which does not match `*.int-spec.ts` — the name
 * ends in `-spec.ts`, not `.spec.ts` — so the split needs no ignore rules
 * that could drift out of step.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.int-spec.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  /* One database, shared. Parallel workers would truncate each other's rows
     between assertions, producing failures that look like race conditions in
     the code rather than in the test setup. */
  maxWorkers: 1,
  testTimeout: 30_000,
};
