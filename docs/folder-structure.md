# CholoJai — Folder Structure

> Where code goes, and why. Filled in as milestones land; the shape below is
> the target agreed in `architecture.md` §2–4.
>
> **Status:** target structure (M1–M2 will create it).

---

## Monorepo root

```
cholojai/
├── apps/
│   ├── web/                    # Next.js 15 (Vercel)
│   └── api/                    # NestJS (Railway)
├── packages/
│   ├── shared/                 # Zod schemas, types, enums, constants
│   ├── eslint-config/          # one ruleset, consumed by both apps
│   └── tsconfig/               # strict base configs
├── docs/
├── .github/workflows/          # CI pipelines
├── .husky/                     # git hooks
├── docker-compose.yml          # Postgres + Redis + Mailpit
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

**Why `packages/shared` exists:** the ride status enum, fare quote schema,
and every API contract are defined once and imported by both apps. Frontend
and backend cannot drift, because drift becomes a compile error (ADR-005).

## `apps/api` — NestJS

```
src/
├── modules/                    # one folder per domain feature
│   └── rides/
│       ├── rides.controller.ts     # HTTP only: routing, status codes, Swagger
│       ├── rides.service.ts        # business logic + state-machine guard
│       ├── rides.repository.ts     # persistence only
│       ├── rides.module.ts
│       ├── dto/                    # Zod-derived DTOs from packages/shared
│       └── __tests__/
├── common/
│   ├── guards/                 # JwtAuthGuard, RolesGuard
│   ├── interceptors/           # logging, request-id, serialization
│   ├── filters/                # global exception filter → RFC 9457
│   ├── decorators/             # @CurrentUser, @Roles
│   └── errors/                 # typed domain errors
├── config/                     # Zod-validated env configuration
├── prisma/                     # schema.prisma, migrations/, seed.ts
└── main.ts
```

**Dependency rule:** controller → service → repository, one direction only.
Cross-module calls go through the other module's *service*, never its
repository — that boundary is what keeps the monolith modular (ADR-002).

## `apps/web` — Next.js

```
src/
├── app/                        # routes only — thin composition files
│   ├── (marketing)/            # landing, safety, fares, blog, careers
│   ├── (auth)/                 # login, register, verify, reset
│   ├── (rider)/                # booking, tracking, history, profile
│   ├── (driver)/               # dashboard, vehicles, earnings
│   └── (admin)/                # users, approvals, analytics, CMS
├── features/                   # the real code
│   └── booking/
│       ├── components/         # feature-private UI
│       ├── hooks/              # React Query hooks
│       ├── api.ts              # typed calls using shared schemas
│       └── store.ts            # Zustand slice, only if needed
├── components/
│   ├── ui/                     # design system primitives (shadcn-based)
│   └── layout/                 # shell, nav, footer
├── lib/                        # axios instance, query client, utils
├── hooks/                      # cross-feature hooks only
└── styles/
```

**Why `features/` and not everything in `app/`:** route files should compose,
not implement. A feature folder keeps its components, data access, and state
together, so the whole feature can be understood — or deleted — in one place.

**Promotion rule:** a component starts feature-private in
`features/x/components/`. It moves to `components/ui/` only when a *second*
feature needs it. Abstraction follows demand; it does not anticipate it.
