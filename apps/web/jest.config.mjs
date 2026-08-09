import nextJest from 'next/jest.js';

/**
 * Jest, via `next/jest`.
 *
 * Jest rather than Vitest is a consistency decision, not a capability one —
 * see ADR-016. `next/jest` is the framework's own wrapper: it transforms
 * with SWC using the same settings as the build, reads the `@/*` path
 * aliases out of tsconfig, stubs CSS and image imports, and loads
 * `.env.test`. Configuring ts-jest by hand would mean maintaining a second,
 * slightly different opinion about how this app compiles.
 *
 * The environment is `node` because nothing here renders yet. Component
 * tests in M4.3 will need `jsdom`; that change belongs with the first
 * component, not before it.
 */
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
};

export default createJestConfig(config);
