<!--
  contributing.md requires every PR to state four things: what changed, why,
  how it was verified, and what a reviewer should look at closely. The
  headings below are those four. Delete a section only if it is genuinely
  empty — "n/a" is a more useful answer than a missing heading.
-->

Closes #

## What changed

<!-- The shape of the change, not a restatement of the diff. -->

## Why

<!--
  The reasoning a reviewer cannot recover from the code. What alternative
  was rejected, and what would have gone wrong if it had been taken?
-->

## How it was verified

<!--
  Which gates were run, and what new coverage was added. `pnpm verify`
  refuses to run over a dirty tree, so a green run here means the branch
  passes, not just your machine.
-->

- [ ] `pnpm verify` green locally
- [ ] Tests added for new business logic, including failure paths
- [ ] Docs updated where a convention, schema, or roadmap status changed

## Look closely at

<!--
  Where you are least confident, or where the change reaches further than
  its title suggests — a cross-milestone dependency, a deliberate
  deviation from a documented rule, a known limitation left in on purpose.
  A PR that claims nothing needs attention usually has not been read by its
  author.
-->
