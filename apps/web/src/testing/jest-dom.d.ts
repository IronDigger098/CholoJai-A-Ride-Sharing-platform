import type { expect } from '@jest/globals';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/**
 * Teaches TypeScript about the jest-dom matchers.
 *
 * `@testing-library/jest-dom/jest-globals` ships its own augmentation, and
 * it does not apply here: it declares `Matchers<R>` with one type
 * parameter, while `expect@29` declares `Matchers<R, T = unknown>` with
 * two. Declaration merging requires identical type parameters, so the
 * merge is rejected — and `skipLibCheck: true` swallows the error, leaving
 * matchers that work at runtime and do not exist to the compiler. The
 * symptom is `toBeVisible does not exist`, on a test that passes.
 *
 * This restates the augmentation against the `expect` module with matching
 * arity. It can be deleted when the monorepo moves to Jest 30, where the
 * upstream declaration lines up again.
 */
/* Both rules are correct in general and wrong in this file. The interface
   body must be empty — everything comes from the extended one — and `T`
   must be declared despite being unused, because declaration merging is
   rejected outright unless the type parameters match the original exactly,
   which is the entire bug this file exists to fix. Disabled for the block
   rather than the line: Prettier reflows the signature across lines, and a
   `next-line` directive silently stops covering what it was written for. */
/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
declare module 'expect' {
  interface Matchers<
    R extends void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<
    ReturnType<typeof expect.stringContaining>,
    R
  > {}
}
/* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
