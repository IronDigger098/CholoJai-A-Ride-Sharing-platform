import path from 'node:path';

import { config as readDotenvFile } from 'dotenv';

/**
 * Loads the monorepo-root `.env` into `process.env` for local development.
 *
 * Node does not read `.env` files on its own. The file lives at the repo
 * root — one file shared by every app — rather than being duplicated per
 * package, so there is a single place to look when something is
 * misconfigured.
 *
 * **Never in production.** There, configuration comes from the platform's
 * secret store (Railway variables, Vercel project settings). Reading a file
 * from disk in production would mean secrets are sitting on the filesystem,
 * and would silently mask a missing platform variable during a deploy.
 *
 * Resolved from `__dirname`, not `process.cwd()`: the working directory
 * depends on how the process was launched (turbo, pnpm filter, a debugger,
 * a container entrypoint), whereas the compiled file's own location does
 * not. `dist/main.js` → three levels up is the repo root.
 *
 * A missing file is not an error — dotenv ignores it, and the environment
 * schema will report anything genuinely absent with a readable message.
 */
export function loadDotenvForLocalDevelopment(): void {
  if (process.env['NODE_ENV'] === 'production') return;

  readDotenvFile({ path: path.resolve(__dirname, '../../../../.env') });
}
