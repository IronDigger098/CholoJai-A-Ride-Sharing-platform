# CholoJai — Product Roadmap

> **Status legend:** 🔲 Not started · 🟡 In progress · ✅ Complete
>
> This roadmap is a living document. Milestones are sequenced so that each one
> produces something shippable and reviewable. We do not begin a milestone
> until the previous one is complete and approved.

| #   | Milestone                       | Scope                                                                                                                                                                                 | Status |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M0  | Product & Architecture Planning | Product spec, domain model, architecture + ADRs, core ERD, API design, docs skeleton                                                                                                  | ✅     |
| M1  | Monorepo Foundation             | Turborepo + pnpm workspaces, strict TypeScript config, ESLint/Prettier, Husky + Commitlint, CI skeleton                                                                               | ✅     |
| M2  | Backend Foundation              | NestJS bootstrap, validated env config, centralized error handling, logging, Swagger, API versioning, Docker Compose, Prisma schema + migrations, health probes, GitHub governance    | ✅     |
| M3  | Authentication & Authorization  | Register/login, JWT + refresh token rotation, email verification, forgot password, RBAC (rider / driver / admin), **Redis + rate limiting**, **CI integration-test job**, seed script | ✅     |
| M4  | Design System & Marketing Site  | Next.js app scaffold, Tailwind v4 tokens, dark mode, type scale, primitives, landing page, SEO foundation                                                                             | ✅     |
| M5  | Ride Booking Core               | Booking workflow, fare estimation engine, ride lifecycle state machine                                                                                                                | 🟡     |
| M6  | Maps & Real-time Tracking       | Maps integration, Socket.IO driver-location simulation                                                                                                                                | 🔲     |
| M7  | Driver Side                     | Driver dashboard, vehicle management, ride acceptance flow                                                                                                                            | 🔲     |
| M8  | Admin & Analytics               | Admin dashboard, user/driver management, analytics                                                                                                                                    | 🔲     |
| M9  | Content & Growth                | Blog CMS, careers, contact, notifications, reviews, coupons, referrals                                                                                                                | 🔲     |
| M10 | Payments & Polish               | Mock payment integration, settings, search, i18n-ready architecture                                                                                                                   | 🔲     |
| M11 | Quality Hardening               | Test coverage push, Lighthouse optimization, accessibility audit                                                                                                                      | 🔲     |
| M12 | Production Deployment           | Vercel + Railway, GitHub Actions pipelines, release process                                                                                                                           | 🔲     |

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

**Infrastructure arrives with its first consumer.** Redis and the CI
integration-test job were originally scoped into M2 and moved to M3 —
deliberately, not by omission. Redis lands with login rate limiting, which
is the first thing that needs it; the integration-test job lands with the
first endpoints worth testing against a real database. Building either
earlier would have meant a module with no caller and a test job with
nothing to run, which `contributing.md` explicitly forbids
("no new abstraction without a second caller"). They are written into M3's
scope above so they are tracked rather than remembered.

**Accessibility is a build step, not a review step.** The design tokens are
checked against WCAG contrast ratios by a unit test that reads the stylesheet,
and the rendered page is audited with axe in both colour schemes. Those two
catch different things, which is the argument for having both: the unit test
found nothing wrong with a caption that axe then failed at 4.23:1, because the
test only compared text against the page surface and never against the raised
surface that cards actually use. A checker that runs against real rendered DOM
sees the combinations that actually occur.

**Integration tests are a separate suite, not a slower unit suite.** The
unit tests run against in-memory adapters and need nothing installed, so they
stay in every commit hook and every developer's inner loop. The `*.int-spec.ts`
suites run against a real PostgreSQL because a handful of the system's most
important guarantees — refresh-token rotation staying atomic under genuinely
concurrent transactions, the partial unique indexes actually firing, cascade
deletes reaching every dependent row — are properties of the database, not of
our code, and a fake can only pretend at them. Keeping the two separate means
neither compromises: the fast suite stays fast, and the slow one is allowed to
be honest about what it needs.
