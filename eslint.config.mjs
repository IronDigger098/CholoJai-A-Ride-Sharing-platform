import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { baseConfig, javascriptFilesConfig } from '@cholojai/eslint-config';
import { nextConfig } from '@cholojai/eslint-config/next';

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

  /* Operational scripts print to stdout — that is their user interface,
     not a stray debug statement. The `no-console` rule exists to stop
     server code bypassing the structured logger, and a CLI has no
     structured logger to bypass. Scoped to the seed directory so the rule
     keeps its teeth everywhere it matters. */
  {
    files: ['apps/*/src/seed/**/*.ts'],
    rules: {
      'no-console': 'off',
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

  /* The web app is the only place React runs, so the React, hooks,
     accessibility, and Core Web Vitals rules are scoped to it rather than
     applied repo-wide — where they would cost lint time on every NestJS
     file to find nothing. */
  ...nextConfig(['apps/web/**/*.{ts,tsx}']),
];
