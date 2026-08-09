import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * The React and Next.js layer, on top of `baseConfig`.
 *
 * Exported as a function taking `files` rather than as a ready-made array.
 * Flat config does not cascade and has no notion of a directory scope, so
 * something must attach the file patterns — and it must not be this package,
 * which knows nothing about where the consumer's app lives. The alternative,
 * a second ESLint config file inside `apps/web`, would mean `eslint .` from
 * the root silently stops applying these rules, which is the failure mode
 * flat config was designed to remove.
 *
 * `next lint` was removed in Next.js 16; ESLint is invoked directly, which
 * is already how this repository works. All four plugins ship native flat
 * config in their current versions, so there is no `FlatCompat` shim here.
 *
 * @param {string[]} files - Glob patterns these rules apply to.
 * @returns {import('eslint').Linter.Config[]}
 */
export function nextConfig(files) {
  return [
    { ...react.configs.flat.recommended, files },

    /* The automatic JSX runtime has been the default since React 17. This
       config's whole job is switching off the rules that existed to enforce
       the old `import React from 'react'` ceremony. */
    { ...react.configs.flat['jsx-runtime'], files },

    { ...reactHooks.configs.flat['recommended-latest'], files },
    { ...jsxA11y.flatConfigs.recommended, files },

    /* core-web-vitals over plain recommended: it promotes the rules tied to
       measurable user-facing metrics — unoptimised images, render-blocking
       stylesheets, sync scripts — from warnings to errors. A performance
       rule that only warns is a performance rule nobody acts on. */
    { ...nextPlugin.configs['core-web-vitals'], files },

    {
      files,
      languageOptions: {
        globals: { ...globals.browser },
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      settings: { react: { version: 'detect' } },
      rules: {
        /* TypeScript already checks props at compile time, and far more
           thoroughly than a runtime shape declaration can. */
        'react/prop-types': 'off',

        /* Server Components are async functions, and the JSX they return is
           a value like any other. This rule predates them. */
        'react/no-unescaped-entities': 'off',

        /* Catches `<a href>` pointing at a Pages Router route instead of
           `<Link>`. This codebase is App Router only and has no `pages`
           directory, so the rule cannot find one and prints a warning about
           its own configuration on every run — noise about a rule that has
           nothing to check. Turned off deliberately rather than silenced by
           pointing it at a directory that does not exist. */
        '@next/next/no-html-link-for-pages': 'off',
      },
    },
  ];
}
