/**
 * Refuse to run the verification gate over a dirty working tree.
 *
 * `pnpm verify` is meant to answer "does this branch pass?" — but every
 * tool it runs reads the working *directory*, not the commit. With
 * uncommitted files present it silently answers a different question:
 * "does this developer's machine pass?" Those two answers diverge exactly
 * when it matters most, and the divergence produces no error message —
 * everything is green locally, CI is red, and nothing points at the cause.
 *
 * M5.1 lost five CI runs to this in a single afternoon. A stale `dist/`, an
 * uncommitted `page.spec.tsx`, and an uncommitted `domain-model.md` each
 * produced a green local gate over a branch that could not pass from a
 * clean checkout.
 *
 * Untracked files count, deliberately. A new source file that has never
 * been `git add`ed is the most common form of this fault and the one a
 * modified-files-only check would miss — it is also invisible to Turbo's
 * input hashing, which is how a stale build survives a cache "miss".
 *
 * Files matched by .gitignore never appear in `git status --porcelain`, so
 * scratch files like commit-msg.txt do not trip this. Anything else that
 * trips it is either work you meant to commit or a file that belongs in
 * .gitignore; both are worth being told about.
 */
import { execFileSync } from 'node:child_process';

function workingTreeStatus() {
  try {
    return execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
    });
  } catch {
    /* No git, or not a repository. This gate is a convenience for
       developers, not a security boundary: a tarball export with no .git
       should still be able to run its own tests. CI checks out from git
       and is clean by construction, so nothing is lost there either. */
    return '';
  }
}

const entries = workingTreeStatus().split('\n').filter(Boolean);

if (entries.length > 0) {
  console.error(
    [
      '',
      '  Working tree is not clean.',
      '',
      '  `verify` would be testing your working directory rather than your',
      '  branch, and those are the same thing only by accident.',
      '',
      ...entries.map((entry) => `    ${entry}`),
      '',
      '  Commit, stash, or .gitignore these, then run it again.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
