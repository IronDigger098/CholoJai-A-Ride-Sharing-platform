# CholoJai — Product Roadmap

> **Status legend:** 🔲 Not started · 🟡 In progress · ✅ Complete
>
> This roadmap is a living document. Milestones are sequenced so that each one
> produces something shippable and reviewable. We do not begin a milestone
> until the previous one is complete and approved.

| #   | Milestone                          | Scope                                                                                                                              | Status |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M0  | Product & Architecture Planning    | Product spec, domain model, architecture + ADRs, core ERD, API design, docs skeleton                                               | 🟡     |
| M1  | Monorepo Foundation                | Turborepo + pnpm workspaces, strict TypeScript config, ESLint/Prettier, Husky + Commitlint, CI skeleton                            | 🔲     |
| M2  | Backend Foundation                 | NestJS bootstrap, validated env config, centralized error handling, logging, Swagger, API versioning, Docker Compose (Postgres + Redis), Prisma init, health checks | 🔲     |
| M3  | Authentication & Authorization     | Register/login, JWT + refresh token rotation, email verification, forgot password, RBAC (rider / driver / admin)                   | 🔲     |
| M4  | Design System & Marketing Site     | Tailwind + shadcn theming, dark mode, typography scale, landing page, SEO foundation                                               | 🔲     |
| M5  | Ride Booking Core                  | Booking workflow, fare estimation engine, ride lifecycle state machine                                                             | 🔲     |
| M6  | Maps & Real-time Tracking          | Maps integration, Socket.IO driver-location simulation                                                                             | 🔲     |
| M7  | Driver Side                        | Driver dashboard, vehicle management, ride acceptance flow                                                                         | 🔲     |
| M8  | Admin & Analytics                  | Admin dashboard, user/driver management, analytics                                                                                 | 🔲     |
| M9  | Content & Growth                   | Blog CMS, careers, contact, notifications, reviews, coupons, referrals                                                             | 🔲     |
| M10 | Payments & Polish                  | Mock payment integration, settings, search, i18n-ready architecture                                                                | 🔲     |
| M11 | Quality Hardening                  | Test coverage push, Lighthouse optimization, accessibility audit                                                                   | 🔲     |
| M12 | Production Deployment              | Vercel + Railway, GitHub Actions pipelines, release process                                                                        | 🔲     |

## Sequencing rationale

**Schema evolves per feature, not up front.** The core domain (users, roles,
drivers, vehicles, rides) is designed in M0; every later feature adds its own
tables via Prisma migrations. This mirrors how real products evolve and keeps
each migration reviewable.

**Auth before UI.** Every dashboard and workflow depends on identity and
roles. Building authentication early means all later features are built
against real authorization from day one instead of having security bolted on
at the end.

**Foundations before features.** M1–M2 look unglamorous but they are what
make every later milestone fast: consistent tooling, one-command local
environment, and a CI pipeline that catches regressions from the first
feature commit.
