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

One branch = one milestone slice or one bug. Long-lived branches rot; if a
branch outlives a few days, it was scoped too large.

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
