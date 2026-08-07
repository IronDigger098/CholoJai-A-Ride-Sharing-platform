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
cp .env.example .env
docker compose up -d      # PostgreSQL, Redis, Mailpit
pnpm db:migrate
pnpm db:seed
pnpm dev                  # web on :3000, api on :4000
```

API docs at `http://localhost:4000/api/docs` once the API is running.

_(Scaffolding lands in Milestone 1 — these commands are the contract we're
building toward.)_

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
