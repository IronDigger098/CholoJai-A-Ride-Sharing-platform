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
