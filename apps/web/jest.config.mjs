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

/**
 * Exported as a function so `transformIgnorePatterns` can be patched after
 * `next/jest` has produced its config.
 *
 * next-intl publishes ESM only. Jest ignores `node_modules` when
 * transforming, so an `export` inside it reaches the parser raw and every
 * suite that touches i18n — eighteen of them, transitively, because the
 * `Link` primitive imports it — dies with "Unexpected token 'export'".
 *
 * Setting the key inside the object above does not work: `next/jest`
 * assigns its own value over whatever it is given, so the override has to
 * happen after its config resolves. That is the reason for the function.
 *
 * The pattern allows for pnpm's layout. A real path here is
 * `node_modules/.pnpm/next-intl@4.13.6.../node_modules/next-intl/dist/…`,
 * so a plain negative lookahead straight after `/node_modules/` would never
 * match. The optional any-directories group in the pattern below is what
 * lets the exception survive that nesting.
 */
export default async function jestConfig() {
  const resolved = await createJestConfig(config)();

  return {
    ...resolved,
    transformIgnorePatterns: [
      /* The whole ESM-only chain under next-intl: the `use-intl` core it
         re-exports, `intl-messageformat` that core formats with, and the
         `@formatjs` packages beneath that. Named as a set rather than
         discovered one failure at a time, and listed rather than
         transforming all of `node_modules` — that would turn a
         fifty-second suite into a several-minute one to solve a problem
         four packages have. */
      '/node_modules/(?!(.*/)?(next-intl|use-intl|intl-messageformat|@formatjs)/)',
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
}
