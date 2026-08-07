import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared base ESLint configuration for every CholoJai package.
 *
 * Flat config (ESLint 9). Consumers extend this and add their own
 * framework layer (Next.js / NestJS).
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const baseConfig = [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: { import: importPlugin },
    rules: {
      /* --- The rule that keeps the codebase honest (project brief: no `any`).
         Error, not warn: a warning is a rule nobody obeys. Genuine unknowns
         use `unknown` + narrowing, with a comment explaining why. --- */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      /* --- Async correctness. A forgotten `await` is the single most
         common source of silent bugs in Node services: the promise
         rejects after the request has already returned 200. --- */
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      /* --- Clarity --- */
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',

      /* --- Import hygiene: a predictable import block reduces merge
         conflicts and makes dependency direction visible at a glance. --- */
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'type',
          ],
          pathGroups: [
            { pattern: '@cholojai/**', group: 'internal', position: 'before' },
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-cycle': ['error', { maxDepth: 4 }],
    },
  },

  /* Test files relax the unsafe-* rules: mocks, fixtures, and framework
     test helpers (Nest's `getHttpServer()` and supertest's `response.body`
     are both typed `any`) legitimately produce loosely typed values.
     Fighting that adds noise, not safety — production code keeps the full
     strictness. */
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // In-memory test doubles implement async interfaces with synchronous
      // bodies. Marking them `async` to satisfy the contract without an
      // await inside is correct, not an oversight.
      '@typescript-eslint/require-await': 'off',
    },
  },

  /* Must be last: turns off every rule that would fight Prettier. */
  prettierConfig,
];

/**
 * Plain JavaScript files (config files, this package's own source) are not
 * part of any tsconfig, so the type-aware rules have no type information to
 * work from and error out. Disable type-checked linting for them; syntactic
 * rules still apply.
 *
 * @type {import('eslint').Linter.Config}
 */
export const javascriptFilesConfig = {
  files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
  ...tseslint.configs.disableTypeChecked,
  rules: {
    ...tseslint.configs.disableTypeChecked.rules,
    /* `disableTypeChecked` only clears rules that need type information.
       This one is syntactic, so it survives — and then demands an
       annotation that JavaScript has no syntax to express. Documenting
       these signatures is JSDoc's job, not the type checker's. */
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
};

export default baseConfig;
