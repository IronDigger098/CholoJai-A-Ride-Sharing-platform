# CholoJai

> **চলো যাই** — _let's go._ A production-grade ride-sharing platform for
> Bangladesh's urban market: upfront fares, verified drivers, live tracking.

[![CI](https://github.com/IronDigger098/CholoJai-A-Ride-Sharing-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/IronDigger098/CholoJai-A-Ride-Sharing-platform/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Status:** 🚧 In development — Milestones 0–4 complete (planning, monorepo foundation, backend foundation, authentication & authorization, design system & marketing site).
See [`docs/roadmap.md`](docs/roadmap.md) for the full plan.

> **Originality:** CholoJai is inspired by the publicly observable experience
> of ride-sharing products. All code, branding, UI, illustrations, content,
> and architecture in this repository are original work.

---

## What it is

A full-stack SaaS platform — marketing site, rider/driver/admin dashboards,
ride booking with upfront fare estimation, simulated real-time driver
tracking, reviews, coupons, referrals, and mock payments — built to
production engineering standards.

## Tech stack

| Layer    | Choice                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod |
| Backend  | NestJS, TypeScript, Prisma, PostgreSQL, Redis, BullMQ, Socket.IO, Passport + JWT, Swagger                                        |
| Tooling  | Turborepo, pnpm, ESLint, Prettier, Husky, Commitlint                                                                             |
| Testing  | Jest, Supertest, Playwright                                                                                                      |
| Infra    | Docker Compose (dev), GitHub Actions, Vercel (web), Railway (API)                                                                |

## Repository layout

```
apps/web       Next.js — marketing site + rider, driver, admin dashboards
apps/api       NestJS — REST API, Socket.IO gateway, BullMQ workers
packages/      shared contracts (Zod schemas, types), eslint + tsconfig presets
docs/          product, architecture, database, and API documentation
```

Full detail: [`docs/folder-structure.md`](docs/folder-structure.md).

## Getting started

> Requires Node 20+, pnpm 9+, and Docker.

```bash
pnpm install
cp .env.example .env                        # Copy-Item on PowerShell
pnpm docker:up                              # PostgreSQL, Redis, Mailpit
pnpm --filter @cholojai/api db:migrate      # migrations + Prisma client
pnpm --filter @cholojai/api db:seed         # accounts you can sign in as
pnpm dev                                    # web on :3000, api on :4000
```

Then confirm everything is wired up:

```bash
pnpm verify                                 # format, build, lint, typecheck, test
```

> **Run `db:migrate` before `verify` on a fresh clone.** The Prisma client
> is generated code and is deliberately not committed, so anything
> importing `@prisma/client` will not compile until it exists.
> `pnpm install` now generates it automatically via a postinstall hook, and
> `pnpm --filter @cholojai/api db:generate` does it on demand.

### Seeded accounts

`db:seed` is idempotent — run it as often as you like — and refuses outright
when `NODE_ENV=production`, because it creates accounts whose password is
published right here.

Every account uses the password **`cholojai-dev-password`**.

| Email                           | Roles         | Why it exists                                                       |
| ------------------------------- | ------------- | ------------------------------------------------------------------- |
| `admin@cholojai.local`          | RIDER, ADMIN  | Bootstraps role management — nothing else can grant the first ADMIN |
| `rafiq@cholojai.local`          | RIDER, DRIVER | Approved driver with an active CNG, available for matching          |
| `nabila@cholojai.local`         | RIDER         | Ordinary verified rider; the default for booking flows              |
| `unverified@cholojai.local`     | RIDER         | Never confirmed their address — for verification and resend flows   |
| `pending-driver@cholojai.local` | RIDER         | Driver application awaiting review; holds no DRIVER role yet        |

Addresses all sit under `.local`, an RFC 6762 reserved suffix that cannot
resolve on the public internet, so a stray verification email can never
reach a real mailbox. Outgoing mail lands in Mailpit either way.

| Service        | URL                            |
| -------------- | ------------------------------ |
| Web app        | http://localhost:3000          |
| API            | http://localhost:4000/api/v1   |
| API reference  | http://localhost:4000/api/docs |
| Mail inbox     | http://localhost:8025          |
| Liveness probe | http://localhost:4000/health   |

## Design system

Colour is defined in two layers. A raw palette — teal, amber, a set of
neutrals, plus red and green for status — sits on one shared lightness ramp in
OKLCH, so a step number means the same visual weight in every hue. On top of
it, a semantic layer names roles rather than colours: `surface`, `content`,
`accent`, `border`, `danger`. Components only ever use the semantic names.

Dark mode is a consequence of that split rather than a feature bolted onto it.
The semantic tokens repoint and nothing else changes — there is not a single
`dark:` class in the application, and the same markup renders correctly in
both schemes. The scheme follows the operating system by default; setting
`data-theme="light"` or `data-theme="dark"` on `<html>` overrides it, and
`color-scheme` moves with it so scrollbars and form controls follow.

Components come from the same discipline: a primitive is built when it has
a real caller, not in anticipation of one. Today that means `Button`, `Card`,
`Link`, and `ThemeToggle` — `Card` and `Link` were extracted from the landing
page once they had a second use, and no `Input` exists because no form does.

The theme control cycles between your system setting and an explicit light or
dark choice, persists it, and follows changes made in another tab. A small
inline script applies a stored preference before the first paint, so choosing
dark does not mean a white flash on every subsequent visit.

Accessibility here is enforced, not asserted. `theme.spec.ts` reads
`theme.css`, resolves every semantic token, and checks that each text pairing
clears WCAG AA in both schemes, with the primary text colour held to AAA. It
also verifies every colour sits inside the sRGB gamut, because an out-of-gamut
OKLCH value is silently clipped by the browser to a different hue. Tokens live
in CSS rather than JavaScript (ADR-014), so the tests read the file the
browser actually receives and there is no second copy to drift.

That unit test is necessary and not sufficient. It checks the pairings someone
thought to list, and the landing page found the gap: a caption on a card
cleared AA against the page surface, which the test checked, and failed at
4.23:1 against the raised surface, which it did not. The rendered page is
therefore also audited with axe in both colour schemes, because a checker
looking at real DOM sees the combinations that actually occur rather than the
ones that were anticipated.

## Testing

Two suites, split by what they need rather than by what they cover.

`pnpm test` runs the unit suite across every package — API, shared contracts,
and web. It needs no database, no Redis, and no network, so it finishes in
seconds and can run on any machine, in any hook, at any time. Everything that
touches infrastructure does so through a port, and the tests supply an
in-memory adapter.

`pnpm test:integration` runs the suites named `*.int-spec.ts`, which exercise
the Prisma adapters against a real PostgreSQL. They exist because the
in-memory fakes cannot check the guarantees that actually matter about the
persistence layer. A fake `rotate` is atomic because JavaScript is
single-threaded; the real one is atomic because PostgreSQL takes a row lock
and re-evaluates `revoked_at IS NULL` after acquiring it. Those are different
claims, and only one of them can fail in production. The same goes for the
partial unique indexes, the `ON DELETE CASCADE` rules, and the deliberate
asymmetry where a soft-deleted account is invisible to `findByEmail` while
still holding its email address.

Set up the test database once. Create it, then migrate it — `db:deploy`
deliberately does not load `.env`, so it uses whatever `DATABASE_URL` you put
in the environment for that one command:

```bash
docker compose exec postgres createdb -U cholojai cholojai_test

DATABASE_URL="postgresql://cholojai:cholojai_dev_password@localhost:5433/cholojai_test?schema=public" \
  pnpm --filter @cholojai/api db:deploy
```

```powershell
docker compose exec postgres createdb -U cholojai cholojai_test

$env:DATABASE_URL = "postgresql://cholojai:cholojai_dev_password@localhost:5433/cholojai_test?schema=public"
pnpm --filter @cholojai/api db:deploy
Remove-Item Env:DATABASE_URL
```

Then run them:

```bash
pnpm test:integration
```

The suites are gated on `DATABASE_TEST_URL` being set, and they refuse to
start unless the database name contains `test` — they truncate every table
between cases, so a crude check that cannot be satisfied by accident is the
right shape. Without the variable they skip rather than fail, which keeps
`pnpm verify` runnable on a laptop with nothing running; CI always sets it,
so the coverage is never quietly lost.

CI additionally runs `prisma migrate deploy` against an empty database on
every pull request. That is a separate guarantee from the tests: it proves
the migration chain still applies from nothing, which is the only thing that
will happen in production and the one thing local development — where the
database has been incrementally migrated for weeks — never checks.

## Documentation

| Document                                                         | Contents                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| [`docs/roadmap.md`](docs/roadmap.md)                             | Milestones and sequencing rationale                         |
| [`docs/product-spec.md`](docs/product-spec.md)                   | Personas, MoSCoW scope, user journeys, NFRs                 |
| [`docs/domain-model.md`](docs/domain-model.md)                   | Ubiquitous language, core decisions, ride state machine     |
| [`docs/architecture.md`](docs/architecture.md)                   | System design and ADRs 001–008                              |
| [`docs/database-erd.md`](docs/database-erd.md)                   | Relational design, indexes, migration policy                |
| [`docs/api-design.md`](docs/api-design.md)                       | REST conventions, error format, v1 surface, realtime events |
| [`docs/folder-structure.md`](docs/folder-structure.md)           | Where code goes and why                                     |
| [`docs/environment-variables.md`](docs/environment-variables.md) | Every env var, purpose, and default                         |
| [`docs/deployment.md`](docs/deployment.md)                       | Environments, pipelines, release process                    |
| [`docs/contributing.md`](docs/contributing.md)                   | Branching, commits, PRs, review standards                   |

## License

MIT — see [`LICENSE`](LICENSE).
