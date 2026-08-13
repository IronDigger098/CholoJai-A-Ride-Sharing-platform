import nextJest from 'next/jest.js';

/**
 * Jest, via `next/jest`.
 *
 * Jest rather than Vitest is a consistency decision, not a capability one —
 * see ADR-017. `next/jest` is the framework's own wrapper: it transforms
 * with SWC using the same settings as the build, reads the `@/*` path
 * aliases out of tsconfig, stubs CSS and image imports, and loads
 * `.env.test`. Configuring ts-jest by hand would mean maintaining a second,
 * slightly different opinion about how this app compiles.
 */
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  /* jsdom for everything, including the theme tests that read a file off
     disk. jsdom is a DOM implementation running inside Node, not a
     sandbox, so `node:fs` still works — splitting the suite across two
     environments to save a few milliseconds of setup would cost more in
     configuration than it saves. */
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  /**
   * Comfortably above `asyncUtilTimeout` in `jest.setup.ts`.
   *
   * These two are nested timers, and their *order* is what matters. When a
   * query genuinely never resolves, whichever fires first writes the error
   * message — and Testing Library's says "unable to find an element with
   * the text …" and prints the DOM, while Jest's says only that five
   * seconds passed.
   *
   * Setting them equal produced exactly that: three suites failing with an
   * opaque timeout and no indication of what they were waiting for. The
   * gap is not slack, it is the difference between a diagnosable failure
   * and a stopwatch.
   */
  testTimeout: 20_000,
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
};

export default createJestConfig(config);
