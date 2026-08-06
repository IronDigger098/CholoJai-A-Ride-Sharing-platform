import path from 'node:path';

/**
 * lint-staged passes ABSOLUTE paths. On Windows those look like
 * `F:/CholoJai/src/x.ts`, and the drive-letter colon breaks the glob layer
 * inside Prettier — it reports "No files matching the pattern" for files
 * that plainly exist.
 *
 * Converting to repo-relative, forward-slash paths sidesteps this and is
 * correct on every platform. Commands run through `pnpm exec` so the local
 * binaries resolve regardless of the strict, non-hoisted node_modules
 * layout configured in .npmrc.
 *
 * @param {string[]} files
 * @returns {string} space-separated, quoted, repo-relative paths
 */
const toRelativeArgs = (files) =>
  files
    .map((file) => path.relative(process.cwd(), file).split(path.sep).join('/'))
    .map((file) => JSON.stringify(file))
    .join(' ');

/** @type {import('lint-staged').Configuration} */
export default {
  '*.{ts,tsx}': (files) => {
    const args = toRelativeArgs(files);
    return [
      `pnpm exec eslint --fix --max-warnings=0 ${args}`,
      `pnpm exec prettier --write ${args}`,
    ];
  },
  '*.{js,jsx,mjs,cjs,json,md,yml,yaml}': (files) => [
    `pnpm exec prettier --write ${toRelativeArgs(files)}`,
  ],
};
