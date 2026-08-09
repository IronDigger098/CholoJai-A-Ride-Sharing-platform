#!/usr/bin/env node
/**
 * Generate the Prisma client after `pnpm install`.
 *
 * The generated client is not a package — it is code written into
 * `node_modules/.prisma` by `prisma generate`. So a fresh clone, a fresh
 * CI checkout, and anyone who has just deleted `node_modules` all end up
 * with every database file failing to compile, with an error that points
 * at TypeScript rather than at the missing step. We lost a build to
 * exactly this during M3.6.
 *
 * Running it from `postinstall` means the client exists whenever the
 * dependencies do.
 *
 * The wrinkle is that `prisma generate` refuses to run unless
 * `DATABASE_URL` resolves, even though generating touches no database. The
 * repository keeps its `.env` at the workspace root, two levels above the
 * schema, where Prisma does not look. So this reads it if present, and
 * otherwise supplies a syntactically valid placeholder — because on a
 * fresh clone there is no `.env` yet, and failing the install would leave a
 * newcomer unable to run the very command that creates one.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '..');
const envFile = join(workspaceRoot, '.env');

/** A URL that parses but points nowhere. Generation never connects. */
const PLACEHOLDER_DATABASE_URL =
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';

/**
 * Pull one variable out of a dotenv file.
 *
 * Deliberately not a dotenv parser: the only value needed is
 * `DATABASE_URL`, and taking on a dependency inside a postinstall hook —
 * which runs before that dependency is guaranteed to be installed — is a
 * bootstrapping problem waiting to happen.
 *
 * @param {string} contents
 * @param {string} name
 * @returns {string | null}
 */
function readVariable(contents, name) {
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    if (trimmed.slice(0, separator).trim() !== name) continue;

    return trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/gu, '');
  }

  return null;
}

const fromEnvFile = existsSync(envFile)
  ? readVariable(readFileSync(envFile, 'utf8'), 'DATABASE_URL')
  : null;

const databaseUrl =
  process.env.DATABASE_URL ?? fromEnvFile ?? PLACEHOLDER_DATABASE_URL;

/* pnpm puts `node_modules/.bin` on PATH for the scripts it runs, but not
   for a script run by hand. Prepending both bin directories means this
   behaves identically as a postinstall hook and as `node scripts/…`,
   which is the difference between a script you can debug and one you
   cannot. */
const binDirs = [
  join(process.cwd(), 'node_modules', '.bin'),
  join(workspaceRoot, 'node_modules', '.bin'),
];

const result = spawnSync('prisma', ['generate'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PATH: [...binDirs, process.env.PATH ?? ''].join(delimiter),
  },
  stdio: 'inherit',
  // Required on Windows, where `prisma` resolves to a .cmd shim that
  // cannot be executed directly.
  shell: true,
});

if (result.status !== 0) {
  /* A non-zero exit here fails `pnpm install`, which is deliberate: the
     alternative is an install that "succeeds" and leaves every database
     file uncompilable, with an error pointing at TypeScript instead of at
     the real cause. But a failed install with no explanation is its own
     trap, so say what happened and how to get moving again. */
  console.error(
    [
      '',
      'Prisma client generation failed.',
      '',
      'The generated client is not a package — it is written into',
      'node_modules/.prisma by `prisma generate`. Without it, every file',
      'that imports @prisma/client fails to compile.',
      '',
      'Most often this is a network problem reaching binaries.prisma.sh.',
      'Once you have connectivity, run:',
      '',
      '  pnpm --filter @cholojai/api db:generate',
      '',
    ].join('\n'),
  );
}

process.exit(result.status ?? 1);
