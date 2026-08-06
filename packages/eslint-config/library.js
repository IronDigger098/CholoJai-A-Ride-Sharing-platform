import { baseConfig } from './index.js';

/**
 * Configuration for shared library packages (packages/*).
 *
 * Libraries are consumed by both the browser and the server, so they must
 * not reach for Node-only or DOM-only globals.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...baseConfig,
  {
    rules: {
      // Shared code is a published contract: every export is documented
      // by its types, so an explicit return type is not optional here.
      '@typescript-eslint/explicit-function-return-type': 'error',
      'no-console': 'error',
    },
  },
];
