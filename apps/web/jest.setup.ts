/**
 * Runs before every test file.
 *
 * `jest-dom` adds matchers that assert on what a user or assistive
 * technology would perceive — `toBeDisabled`, `toHaveAccessibleName`,
 * `toBeVisible` — rather than on implementation details. That difference
 * matters: `expect(button.className).toContain('disabled')` passes for a
 * button that is still perfectly clickable.
 *
 * The `/jest-globals` entry point, not the bare package. Tests import
 * `expect` from `@jest/globals` rather than relying on the injected
 * global, and the default entry augments only the global one — so the
 * matchers would work at runtime and be invisible to the compiler.
 */
import '@testing-library/jest-dom/jest-globals';

import { configure } from '@testing-library/react';

/**
 * How long `findBy*` and `waitFor` wait before giving up.
 *
 * The library's default is one second, which is generous for a single suite
 * and not generous at all for twenty-three of them sharing a machine. Jest
 * runs suites in parallel workers; under that load a component that mounts,
 * fires a React Query fetch, resolves a mocked promise and re-renders can
 * take longer than a second to reach its first paint — and the assertion
 * fails on a component that is perfectly correct.
 *
 * We saw exactly that: `user-directory.spec.tsx` failing alone in a full run
 * with "Loading…" still in the DOM, then passing on its own and in the next
 * full run. Three runs, three different sets of failures, no code change
 * between them.
 *
 * Five seconds is not slower. A timeout is a ceiling, not a delay: every
 * passing assertion still resolves the moment its condition is true. The
 * only thing it changes is how long a *failing* test takes to admit it, and
 * that is the right thing to be generous about — a suite that cries wolf
 * teaches people to re-run rather than to read, which is how a real
 * regression gets waved through.
 */
configure({ asyncUtilTimeout: 5000 });

/**
 * A stand-in for the App Router.
 *
 * `useRouter` throws "invariant expected app router to be mounted" outside
 * a Next render, because the router is supplied by the framework and not by
 * React. Any component that can navigate therefore cannot be rendered in
 * jsdom without one — since M10b that includes `LocaleSwitcher`, and
 * through it the site header and every page that renders it.
 *
 * Mocked here rather than in each spec because it is a property of the
 * environment, not of any one test: nothing in jsdom has an App Router, and
 * repeating the same six stubs in eight files is eight places for them to
 * drift. A spec that wants to *assert* on navigation mocks
 * `@/i18n/navigation` itself and overrides this — `locale-switcher.spec.tsx`
 * does exactly that.
 *
 * `requireActual` is spread first so the parts that need no router —
 * `notFound`, `redirect`, the types — keep working.
 */
jest.mock('next/navigation', () => {
  /* Annotated rather than spread inline. `requireActual` is typed `any`,
     and spreading it straight into the returned object makes the whole
     factory an unsafe return — `no-unsafe-return` is right to refuse it,
     because everything downstream would silently lose its types. */
  const actual = jest.requireActual<Record<string, unknown>>('next/navigation');

  return {
    ...actual,
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      prefetch: jest.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
  };
});
