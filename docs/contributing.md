# Contributing to CholoJai

> Standards this repository is held to. They apply to every commit, including
> solo work — the point is to practise the discipline, not to satisfy a
> reviewer.

---

## Branching

`main` is always deployable and protected. All work happens on branches:

| Prefix      | Use                                       |
| ----------- | ----------------------------------------- |
| `feat/`     | New capability — `feat/ride-booking-flow` |
| `fix/`      | Bug fix — `fix/fare-rounding-error`       |
| `refactor/` | Behaviour-preserving change               |
| `docs/`     | Documentation only                        |
| `chore/`    | Tooling, deps, config                     |
| `test/`     | Tests only                                |

**One branch = one milestone, or one bug.** A milestone branch carries one
commit per slice, and `pnpm verify` runs after each slice rather than being
saved for the end. The commits stay slice-sized, so the pull request reads as
a sequence of decisions instead of one wall of diff.

This replaces an earlier rule of one branch per slice. That produced a pull
request every hour or two, and the ceremony began costing more than the
isolation bought — the real gate is `pnpm verify`, which runs locally after
every slice either way, and CI was mostly confirming a result already known.

The trade is worth naming rather than discovering. CI now runs once per
milestone, so a fault that only appears on a clean checkout — a missing
migration, an uncommitted file, a stale `dist/` — surfaces later and against
a larger diff. `verify`'s clean-tree guard exists for exactly that class of
fault, and it matters more under this rule than it did under the old one.

A milestone branch that outlives a week is a milestone that was scoped too
large. Split it and land the part that is finished.

## Commits — Conventional Commits

Format: `type(scope): subject`, enforced by Commitlint via a Husky hook.

```
feat(rides): add ride cancellation with reason codes
fix(fares): correct paisa rounding on percentage discounts
docs(architecture): add ADR-009 for image storage
test(auth): cover refresh token reuse detection
```

Rules: imperative mood ("add", not "added"); subject ≤ 72 characters, no
trailing period; breaking changes carry a `BREAKING CHANGE:` footer. The
body explains **why**, not what — the diff already shows what.

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`,
`ci`, `style`.

## Pull requests

Every change lands via PR, even solo. A PR must state: what changed, why,
how it was verified, and anything a reviewer should look at closely. Link
the issue and milestone.

Merge requires: CI green (lint, typecheck, unit, integration, build), no
new `any`, tests for new business logic, and docs updated when a convention
or schema changed.

Squash-merge to `main` so history reads as one commit per logical change.

## Code standards

- **TypeScript strict.** No `any`. If a type is genuinely unknowable, use
  `unknown` and narrow it, and leave a comment explaining why.
- **Single responsibility.** A function that needs "and" to describe it
  wants to be two functions.
- **No magic numbers.** Named constants, colocated with their domain.
- **Layering is not optional.** Controllers translate HTTP; services hold
  logic; repositories persist. See `architecture.md` §3.
- **Errors are typed.** Throw domain errors; the global filter shapes the
  response. Never build an error body by hand.
- **No new abstraction without a second caller.** Premature abstraction
  costs more than duplication.

## Verifying before you push

`pnpm verify` runs the same gates as CI, in the same order:
clean tree → format → build → lint → typecheck → test.

**It refuses to run over a dirty working tree, and that is the point.** Every
tool in the chain reads the working _directory_, not the commit. With
uncommitted or untracked files present, a green run tells you your machine
passes — not your branch. The two diverge silently, and the symptom is
always the same: green locally, red in CI, with nothing pointing at why.

M5.1 lost five CI runs to exactly this. A stale `dist/` served declaration
files from before a new module existed; an updated `page.spec.tsx` and a
corrected `domain-model.md` were both sitting unstaged. Each one made the
local gate pass over a branch that could not pass from a clean checkout.

Use `pnpm verify:clean` when a build result looks suspicious — it wipes every
`dist/` and Turbo cache first. Turbo's caching is right for iteration and
wrong for a pre-push gate: a replayed cache entry proves that something
passed once, not that this tree passes now.

## Testing expectations

| Change                          | Required                                       |
| ------------------------------- | ---------------------------------------------- |
| Business logic (service)        | Unit tests, including failure paths            |
| New/changed endpoint            | Integration test: happy path + each error case |
| Golden journey (J1–J3) affected | Playwright E2E updated                         |
| Bug fix                         | A test that fails before the fix               |

## Definition of done

A milestone is complete when: the feature works end to end, tests pass in
CI, docs are updated, no TODOs remain without a linked issue, and it has
been reviewed and approved.
