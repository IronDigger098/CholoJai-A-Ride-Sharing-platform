# CholoJai

> **চলো যাই** — _let's go._ A production-grade ride-sharing platform for
> Bangladesh's urban market: upfront fares, verified drivers, live tracking.

[![CI](https://github.com/IronDigger098/CholoJai-A-Ride-Sharing-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/IronDigger098/CholoJai-A-Ride-Sharing-platform/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Status:** 🚧 In development — Milestones 0–2 complete (planning, monorepo foundation, backend foundation).
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

| Layer    | Choice                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind, shadcn/ui, Framer Motion, TanStack Query, Zustand, React Hook Form + Zod |
| Backend  | NestJS, TypeScript, Prisma, PostgreSQL, Redis, BullMQ, Socket.IO, Passport + JWT, Swagger                            |
| Tooling  | Turborepo, pnpm, ESLint, Prettier, Husky, Commitlint                                                                 |
| Testing  | Jest, Supertest, Playwright                                                                                          |
| Infra    | Docker Compose (dev), GitHub Actions, Vercel (web), Railway (API)                                                    |

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
