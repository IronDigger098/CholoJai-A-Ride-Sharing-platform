/**
 * Conventional Commits, enforced — `docs/contributing.md`.
 *
 * A machine-readable history is not bureaucracy: it generates the changelog,
 * drives semantic version bumps, and makes `git log` searchable by scope.
 *
 * @type {import('@commitlint/types').UserConfig}
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // new capability
        'fix', // bug fix
        'refactor', // behaviour-preserving change
        'perf', // performance
        'docs', // documentation
        'test', // tests only
        'chore', // deps, tooling, housekeeping
        'build', // build system
        'ci', // pipelines
        'style', // formatting only
        'revert',
      ],
    ],
    // Scopes are free-form but must be lower-case: `feat(rides):`, not
    // `feat(Rides):` — consistency makes them greppable.
    'scope-case': [2, 'always', 'lower-case'],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 100],
  },
};
