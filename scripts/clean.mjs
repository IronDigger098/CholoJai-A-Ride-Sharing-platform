#!/usr/bin/env node
/**
 * Cross-platform `rm -rf`.
 *
 * Every `clean` script in this repository used to be `rm -rf dist .turbo`,
 * which works on macOS and Linux and silently does nothing on Windows:
 * pnpm runs scripts through `cmd.exe`, where `rm` does not exist. The
 * failure is quiet — the command errors, the developer sees one line of
 * noise, and the stale output stays exactly where it was. We lost real time
 * in M3.4 to a stale `dist` that `pnpm clean` should have removed in one
 * step.
 *
 * Node's own `fs.rmSync` behaves identically on every platform and ships
 * with the runtime we already require, so this costs no dependency.
 *
 * Usage:
 *   node scripts/clean.mjs dist .turbo "*.tsbuildinfo"
 *
 * Paths resolve relative to the current working directory — which, under
 * pnpm, is the package that invoked the script. A leading-`*` glob is
 * supported for the one case that needs it (`*.tsbuildinfo`); anything more
 * elaborate belongs in a real tool, not here.
 */

import { readdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error('clean: nothing to remove — pass at least one path');
  process.exit(1);
}

const root = resolve(process.cwd());

/**
 * Expand a simple `*.ext` pattern against the working directory.
 *
 * @param {string} pattern
 * @returns {string[]}
 */
function expand(pattern) {
  if (!pattern.startsWith('*')) return [pattern];

  const suffix = pattern.slice(1);

  try {
    return readdirSync(root).filter((name) => name.endsWith(suffix));
  } catch {
    return [];
  }
}

for (const target of targets.flatMap(expand)) {
  const path = resolve(root, target);

  /* Refuse to delete outside the package that invoked us. `rm -rf` with a
     mistyped path is a well-known way to lose a home directory, and a clean
     script is exactly where such a mistake would go unnoticed. Comparing
     with a trailing separator stops `/app` from matching `/apple`. */
  if (path !== root && !path.startsWith(root + sep)) {
    console.error(`clean: refusing to remove outside the package: ${target}`);
    process.exit(1);
  }

  rmSync(path, { recursive: true, force: true });
}
