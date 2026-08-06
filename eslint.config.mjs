import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { baseConfig, javascriptFilesConfig } from '@cholojai/eslint-config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The single ESLint configuration for the whole monorepo.
 *
 * ESLint 9 flat config does NOT cascade — the config resolved from the
 * working directory is the only one applied. One root config is therefore
 * the idiomatic shape for a monorepo: per-package rules are expressed with
 * `files` scoping rather than per-package config files, and a single
 * `eslint .` from the root lints everything with one binary resolution.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...baseConfig,

  {
    languageOptions: {
      parserOptions: {
        // The project service discovers the nearest tsconfig.json for each
        // file, so every package keeps its own compiler settings.
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
  },

  javascriptFilesConfig,

  /* Shared libraries are a published contract consumed by both apps:
     every export documents itself with an explicit return type, and
     nothing may log. */
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      'no-console': 'error',
    },
  },

  /* Tests in shared libraries may log while debugging and need no
     ceremony around return types. */
  {
    files: ['packages/*/src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'off',
    },
  },
];
