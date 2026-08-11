/**
 * Bring the integration-test database up to the current schema.
 *
 * CI has this step and `verify` did not. When `test:integration` was added
 * to the gate, the migrate step that CI runs beside it was not — so the
 * local test database stayed at whatever schema it held when it was created
 * and drifted further behind with every migration. The failure this
 * produces is "column x does not exist", pointing at the adapter rather than
 * at the database, which reads as a bug in code that is correct.
 *
 * `migrate deploy` rather than `migrate dev`: it only replays existing
 * migrations and never generates one, so pointing it at the test database
 * cannot invent a migration from local schema edits.
 *
 * Absent `DATABASE_TEST_URL`, this exits successfully and says nothing. The
 * integration suites already skip themselves in that case, and failing here
 * would break `verify` for anyone who has not set up a test database — the
 * gate is allowed to run fewer checks, not to refuse to run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Read `.env` without a dependency.
 *
 * The root has `dotenv-cli`, but it can only load a file into the
 * environment — it cannot rename one variable to another, which is the
 * whole job here. Real values are never printed.
 */
function readEnvFile() {
  const path = join(root, '.env');

  if (!existsSync(path)) return {};

  const entries = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');

      if (separator === -1) return null;

      const key = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^["']|["']$/gu, '');

      return [key, value];
    })
    .filter((entry) => entry !== null);

  return Object.fromEntries(entries);
}

const fileEnv = readEnvFile();
const testUrl =
  process.env['DATABASE_TEST_URL'] ?? fileEnv['DATABASE_TEST_URL'];

if (testUrl === undefined || testUrl === '') {
  /* `warn`, not `log`: the gate is about to run fewer checks than it looks
     like it is running, and that is worth noticing rather than scrolling
     past. It is also the only console level the lint config allows here. */
  console.warn(
    'DATABASE_TEST_URL is not set; skipping the test-database migration.',
  );
  process.exit(0);
}

/* The same guard the suites themselves apply. These migrations run against
   whatever this points at, and a URL that is not obviously a test database
   is one migration away from being someone's development data. */
if (!/test/iu.test(testUrl)) {
  console.error(
    '\n  DATABASE_TEST_URL does not name a test database.\n' +
      '  Refusing to migrate it. The name must contain "test".\n',
  );
  process.exit(1);
}

const result = spawnSync(
  'pnpm',
  ['--filter', '@cholojai/api', 'exec', 'prisma', 'migrate', 'deploy'],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...fileEnv, DATABASE_URL: testUrl },
  },
);

process.exit(result.status ?? 1);
